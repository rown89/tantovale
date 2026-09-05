import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import { describeRoute } from 'hono-openapi';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { commerce_reconciliation_audit, entityTrustapTransactions, orders, orders_proposals } from '#db-schema';
import {
	type EntityTrustapTransactionStatus,
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
const knownTrustapStatuses: ReadonlySet<string> = new Set(entityTrustapTransactionStatusValues);
function isKnownTrustapStatus(value: string): value is EntityTrustapTransactionStatus {
	return knownTrustapStatuses.has(value);
}
const trustapTimestamp = z
	.string()
	.datetime({ offset: true })
	.transform((value, context) => {
		const timestamp = new Date(value);
		if (Number.isFinite(timestamp.getTime())) return timestamp;
		context.addIssue({ code: 'custom', message: 'Invalid provider timestamp' });
		return z.NEVER;
	});
const trustapWebhookTransactionId = z.union([z.string(), z.number()]).transform((value, context) => {
	const id = canonicalTrustapId(value);
	if (id) return id;
	context.addIssue({ code: 'custom', message: 'Invalid transaction id' });
	return z.NEVER;
});
const trustapV1TransactionPreviewSchema = z.object({
	id: trustapWebhookTransactionId,
	status: z.string().trim().min(1).max(100),
	created: trustapTimestamp.optional(),
	joined: trustapTimestamp.optional(),
	paid: trustapTimestamp.optional(),
	tracked: trustapTimestamp.optional(),
	tracking: z
		.object({
			carrier: z.string().trim().min(1),
			tracking_code: z.string().trim().min(1),
		})
		.optional(),
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
const trustapWebhookSchema = z
	.object({
		code: z.string().regex(/^basic_tx\.[a-z_]+$/u),
		user_id: z.string().trim().min(1).optional(),
		target_id: trustapWebhookTransactionId,
		target_preview: trustapV1TransactionPreviewSchema,
		time: trustapTimestamp.optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.superRefine((payload, context) => {
		if (payload.target_id !== payload.target_preview.id) {
			context.addIssue({ code: 'custom', message: 'Trustap webhook target mismatch' });
		}
		if (payload.code !== `basic_tx.${payload.target_preview.status}`) {
			context.addIssue({ code: 'custom', message: 'Trustap webhook status mismatch' });
		}
	})
	.transform(({ code, target_id, target_preview }) => ({
		code,
		transaction_id: target_id,
		status: target_preview.status,
		created: target_preview.created,
		joined: target_preview.joined,
		paid: target_preview.paid,
		tracked: target_preview.tracked,
		tracking: target_preview.tracking,
		delivered: target_preview.delivered,
		complained: target_preview.complained,
		funds_released: target_preview.funds_released,
		complaint_period_deadline: target_preview.complaint_period_deadline,
		complaint_period_ended: target_preview.complaint_period_ended,
		rejected: target_preview.rejected,
		cancelled: target_preview.cancelled,
		cancelled_with_payment: target_preview.cancelled_with_payment,
		payment_refunded: target_preview.payment_refunded,
	}));

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
			parsedBody = parseJsonWithTopLevelTrustapId(await c.req.text(), 'target_id');
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
				const incomingStatus = payload.status;
				if (!isKnownTrustapStatus(incomingStatus)) {
					const snapshot = {
						order: { id: order.id, itemId: order.itemId, status: order.status },
						provider: trustapTransaction,
						incomingCode: payload.code,
						incomingStatus,
					};
					await tx.insert(commerce_reconciliation_audit).values([
						{
							conflict_type: 'runtime_unknown_provider_status',
							source_table: 'entity_trustap_transactions',
							source_row_id: trustapTransaction.id,
							canonical_row_id: order.id,
							original_reference: payload.transaction_id,
							snapshot,
						},
						{
							conflict_type: 'runtime_unknown_provider_status',
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
					return c.json({ success: true, message: 'Unknown transaction status quarantined' }, 200);
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
				const transition = resolveTrustapOrderTransition(trustapTransaction.status, order.status, incomingStatus);
				const providerLineageApplies = isReachableOrSameTrustapTransition(
					trustapTransaction.status,
					incomingStatus,
					transition,
				);
				if (!providerLineageApplies) {
					return c.json({ success: true, message: 'Transaction update ignored' }, 200);
				}
				if (
					!isTrustapTransitionCompatibleWithTerminalOrder(
						trustapTransaction.status,
						order.status,
						incomingStatus,
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
						incomingStatus,
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
					incomingStatus,
					transition,
				);
				const resolvesCreationReconciliation =
					order.paymentCreationState === PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED &&
					isAuthoritativeCreationResolutionStatus(incomingStatus) &&
					!linkedProposalIsPending;
				const mayMutateOrderState =
					transition.apply ||
					Boolean(cancellationSettlement) ||
					incomingStatus === entityTrustapTransactionTypeValues.COMPLAINED ||
					resolvesCreationReconciliation;
				if (mayMutateOrderState && (await shippingLabelPurchaseDefersOrderTransition(tx, order.id, payload.tracking))) {
					return c.json({ error: SHIPPING_LABEL_TRANSITION_DEFERRED }, 503);
				}
				const complaintReconciliation = await complaintRequiresDurableReconciliation(tx, {
					orderId: order.id,
					providerId: trustapTransaction.id,
					transactionId: payload.transaction_id,
					currentProviderStatus: trustapTransaction.status,
					incomingProviderStatus: incomingStatus,
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
								  isAuthoritativeCancellationStatus(incomingStatus)
								? { payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED }
								: {}),
						updated_at: new Date(),
					})
					.where(eq(orders.payment_transaction_id, payload.transaction_id))
					.returning();

				if (!updatedOrder) throw new Error('Failed to update order status');

				// Handle specific status changes
				switch (incomingStatus) {
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
						console.log(`Transaction ${payload.transaction_id} status updated to: ${incomingStatus}`);
				}

				return c.json({ success: true, message: 'Transaction updated successfully' }, 200);
			});
		} catch (error) {
			console.error('Error processing Trustap webhook:', error);
			return c.json({ error: 'Internal server error' }, 500);
		}
	},
);
