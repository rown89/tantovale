import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import { describeRoute } from 'hono-openapi';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { commerce_reconciliation_audit, entityTrustapTransactions, orders, orders_proposals } from '#db-schema';
import {
	entityTrustapTransactionStatusValues,
	entityTrustapTransactionTypeValues,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '#database/schemas/enumerated_values';
import {
	isAuthoritativeCancellationStatus,
	isAuthoritativeCreationResolutionStatus,
	isReachableOrSameTrustapTransition,
	isTrustapTransitionCompatibleWithTerminalOrder,
	resolveCronCancellationSettlement,
	resolveTrustapOrderTransition,
} from '../payments/trustap-order-state';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';
import { canonicalTrustapId, parseJsonWithTopLevelTrustapId } from '../payments/trustap-int64';
import {
	SHIPPING_LABEL_TRANSITION_DEFERRED,
	shippingLabelPurchaseDefersOrderTransition,
} from '#lib/shipping-label-transition-guard';
import { authenticateTrustapWebhook } from './basic-auth';
import { complaintRequiresDurableReconciliation } from '../payments/complaint-reconciliation';
import { webhooksOpenApi } from '../../openapi/routes';

// Trustap v1 webhook JSON is small; bound buffering before parsing to 64 KiB.
const maxWebhookBodySize = 64 * 1024;
const trustapTimestamp = z
	.string()
	.datetime({ offset: true })
	.transform((value, context) => {
		const timestamp = new Date(value);
		if (Number.isFinite(timestamp.getTime())) return timestamp;
		context.addIssue({ code: 'custom', message: 'Invalid provider timestamp' });
		return z.NEVER;
	});
const trustapV1WebhookSchema = z.object({
	event: z.literal('transaction_updated'),
	transaction_id: z.union([z.string(), z.number()]).transform((value, context) => {
		const id = canonicalTrustapId(value);
		if (id) return id;
		context.addIssue({ code: 'custom', message: 'Invalid transaction id' });
		return z.NEVER;
	}),
	status: z.enum(entityTrustapTransactionStatusValues),
	created: trustapTimestamp.optional(),
	joined: trustapTimestamp.optional(),
	paid: trustapTimestamp.optional(),
	tracked: trustapTimestamp.optional(),
	delivered: trustapTimestamp.optional(),
	complained: trustapTimestamp.optional(),
	funds_released: trustapTimestamp.optional(),
	complaint_period_deadline: trustapTimestamp.optional(),
	complaint_period_ended: trustapTimestamp.optional(),
	rejected: trustapTimestamp.optional(),
	cancelled: trustapTimestamp.optional(),
	cancelled_with_payment: trustapTimestamp.optional(),
	payment_refunded: trustapTimestamp.optional(),
});
const v2WebhookMarkers = ['code', 'target_id', 'target_preview'] as const;
const trustapWebhookSchema = z
	.unknown()
	.superRefine((value, context) => {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
		for (const marker of v2WebhookMarkers) {
			if (Object.hasOwn(value, marker)) {
				context.addIssue({ code: 'custom', message: 'Trustap v2 payload is not supported' });
			}
		}
	})
	.pipe(trustapV1WebhookSchema);

export const webhooksRoute = createRouter().post(
	'/trustap/transaction-update',
	describeRoute(webhooksOpenApi.trustap),
	authenticateTrustapWebhook,
	bodyLimit({
		maxSize: maxWebhookBodySize,
		onError: (context) => context.json({ error: 'Webhook payload too large' }, 413),
	}),
	async (c) => {
		let parsedBody: unknown;
		try {
			parsedBody = parseJsonWithTopLevelTrustapId(await c.req.text(), 'transaction_id');
		} catch (error) {
			if (error instanceof Error && error.name === 'BodyLimitError') throw error;
			return c.json({ error: 'Invalid payload' }, 400);
		}
		const parsedPayload = trustapWebhookSchema.safeParse(parsedBody);
		if (!parsedPayload.success) return c.json({ error: 'Invalid payload' }, 400);
		const payload = parsedPayload.data;
		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				const [identity] = await tx
					.select({ entityId: entityTrustapTransactions.entityId })
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, payload.transaction_id))
					.limit(1);
				if (!identity) {
					console.error(`Transaction ${payload.transaction_id} not found in database`);
					return c.json({ error: 'Transaction not found' }, 404);
				}
				if (identity.entityId === null) {
					return c.json({ error: 'Transaction item not found' }, 404);
				}
				await acquireItemCommerceLock(tx, identity.entityId);
				const [trustapTransaction] = await tx
					.select()
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, payload.transaction_id))
					.for('update')
					.limit(1);
				if (!trustapTransaction || trustapTransaction.entityId !== identity.entityId) {
					return c.json({ error: 'Transaction not found' }, 404);
				}
				if (trustapTransaction.quarantined) {
					return c.json({ success: true, message: 'Quarantined transaction update ignored' }, 200);
				}
				const [order] = await tx
					.select({
						id: orders.id,
						itemId: orders.item_id,
						status: orders.status,
						paymentCancellationState: orders.payment_cancellation_state,
						paymentCreationState: orders.payment_creation_state,
						proposalId: orders.order_proposal_id,
					})
					.from(orders)
					.where(eq(orders.payment_transaction_id, payload.transaction_id))
					.limit(1);
				if (!order) {
					console.warn(`Order not found for transaction ${payload.transaction_id}`);
					return c.json({ error: 'Order not found' }, 404);
				}
				if (order.itemId !== identity.entityId) {
					return c.json({ error: 'Order transaction conflict' }, 409);
				}
				const [linkedProposal] =
					order.proposalId === null
						? []
						: await tx
								.select({ status: orders_proposals.status })
								.from(orders_proposals)
								.where(eq(orders_proposals.id, order.proposalId))
								.for('update')
								.limit(1);
				const linkedProposalIsPending = linkedProposal?.status === ORDER_PROPOSAL_PHASES.pending;
				const transition = resolveTrustapOrderTransition(trustapTransaction.status, order.status, payload.status);
				const providerLineageApplies = isReachableOrSameTrustapTransition(
					trustapTransaction.status,
					payload.status,
					transition,
				);
				if (!providerLineageApplies) {
					return c.json({ success: true, message: 'Transaction update ignored' }, 200);
				}
				if (
					!isTrustapTransitionCompatibleWithTerminalOrder(
						trustapTransaction.status,
						order.status,
						payload.status,
						order.paymentCancellationState,
						transition,
					)
				) {
					const snapshot = {
						order: {
							id: order.id,
							itemId: order.itemId,
							status: order.status,
							paymentCancellationState: order.paymentCancellationState,
							paymentCreationState: order.paymentCreationState,
						},
						provider: trustapTransaction,
						incomingStatus: payload.status,
					};
					await tx.insert(commerce_reconciliation_audit).values([
						{
							conflict_type: 'runtime_terminal_provider_status_conflict',
							source_table: 'entity_trustap_transactions',
							source_row_id: trustapTransaction.id,
							canonical_row_id: order.id,
							original_reference: payload.transaction_id,
							snapshot,
						},
						{
							conflict_type: 'runtime_terminal_provider_status_conflict',
							source_table: 'orders',
							source_row_id: order.id,
							canonical_row_id: trustapTransaction.id,
							original_reference: payload.transaction_id,
							snapshot,
						},
					]);
					await tx
						.update(entityTrustapTransactions)
						.set({ quarantined: true, updated_at: new Date() })
						.where(eq(entityTrustapTransactions.id, trustapTransaction.id));
					return c.json({ success: true, message: 'Conflicting terminal transaction update quarantined' }, 200);
				}
				const cancellationSettlement = resolveCronCancellationSettlement(
					order.paymentCancellationState,
					trustapTransaction.status,
					payload.status,
					transition,
				);
				const resolvesCreationReconciliation =
					order.paymentCreationState === PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED &&
					isAuthoritativeCreationResolutionStatus(payload.status) &&
					!linkedProposalIsPending;
				const mayMutateOrderState =
					transition.apply ||
					Boolean(cancellationSettlement) ||
					payload.status === entityTrustapTransactionTypeValues.COMPLAINED ||
					resolvesCreationReconciliation;
				if (mayMutateOrderState && (await shippingLabelPurchaseDefersOrderTransition(tx, order.id))) {
					return c.json({ error: SHIPPING_LABEL_TRANSITION_DEFERRED }, 503);
				}
				const complaintReconciliation = await complaintRequiresDurableReconciliation(tx, {
					orderId: order.id,
					providerId: trustapTransaction.id,
					transactionId: payload.transaction_id,
					currentProviderStatus: trustapTransaction.status,
					incomingProviderStatus: payload.status,
				});
				const complaintRequiresReconciliation = complaintReconciliation.required;
				if (
					!transition.apply &&
					!cancellationSettlement &&
					!complaintReconciliation.inserted &&
					!(
						complaintRequiresReconciliation &&
						order.paymentCreationState !== PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED
					) &&
					!resolvesCreationReconciliation
				) {
					return c.json({ success: true, message: 'Transaction update ignored' }, 200);
				}
				// Update transaction status
				if (transition.apply) {
					const [updatedTransaction] = await tx
						.update(entityTrustapTransactions)
						.set({
							status: transition.providerStatus,
							updated_at: new Date(),
							...(payload.complaint_period_deadline && {
								complaintPeriodDeadline: payload.complaint_period_deadline,
							}),
						})
						.where(eq(entityTrustapTransactions.transactionId, payload.transaction_id))
						.returning();
					if (!updatedTransaction) throw new Error('Failed to update transaction status');
				}

				// Update corresponding order status
				const [updatedOrder] = await tx
					.update(orders)
					.set({
						status: cancellationSettlement?.orderStatus ?? transition.orderStatus,
						...(complaintRequiresReconciliation
							? { payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED }
							: resolvesCreationReconciliation
								? { payment_creation_state: PAYMENT_CREATION_STATES.CREATED }
								: {}),
						...(cancellationSettlement
							? { payment_cancellation_state: cancellationSettlement.paymentCancellationState }
							: order.paymentCancellationState !== PAYMENT_CANCELLATION_STATES.CANCELLING &&
								  isAuthoritativeCancellationStatus(payload.status)
								? { payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED }
								: {}),
						updated_at: new Date(),
					})
					.where(eq(orders.payment_transaction_id, payload.transaction_id))
					.returning();

				if (!updatedOrder) throw new Error('Failed to update order status');

				// Handle specific status changes
				switch (payload.status) {
					case 'paid':
						// Transaction has been paid, buyer can now claim
						console.log(`Transaction ${payload.transaction_id} has been paid`);
						break;

					case 'funds_released':
						// Funds have been released to seller
						console.log(`Transaction ${payload.transaction_id} funds released`);
						break;

					case 'cancelled':
						// Transaction was cancelled
						console.log(`Transaction ${payload.transaction_id} was cancelled`);
						break;

					default:
						console.log(`Transaction ${payload.transaction_id} status updated to: ${payload.status}`);
				}

				return c.json({ success: true, message: 'Transaction updated successfully' }, 200);
			});
		} catch (error) {
			console.error('Error processing Trustap webhook:', error);
			return c.json({ error: 'Internal server error' }, 500);
		}
	},
);
