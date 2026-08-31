import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { entityTrustapTransactions, orders } from '#db-schema';
import {
	entityTrustapTransactionStatusValues,
	entityTrustapTransactionTypeValues,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '#database/schemas/enumerated_values';
import {
	isAuthoritativeCancellationStatus,
	isAuthoritativeCreationResolutionStatus,
	resolveTrustapOrderTransition,
} from '../payments/trustap-order-state';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';
import { canonicalTrustapId, parseJsonWithTopLevelTrustapId } from '../payments/trustap-int64';
import {
	SHIPPING_LABEL_TRANSITION_DEFERRED,
	shippingLabelPurchaseDefersOrderTransition,
} from '#lib/shipping-label-transition-guard';
import { authenticateTrustapWebhook } from './basic-auth';

const trustapTimestamp = z.string().datetime({ offset: true });
const trustapWebhookSchema = z
	.object({
		event: z.literal('transaction_updated'),
		transaction_id: z.union([z.string(), z.number()]).transform((value, context) => {
			const id = canonicalTrustapId(value);
			if (id) return id;
			context.addIssue({ code: 'custom', message: 'Invalid transaction id' });
			return z.NEVER;
		}),
		status: z.enum(entityTrustapTransactionStatusValues),
		paid: trustapTimestamp.optional(),
		funds_released: trustapTimestamp.optional(),
		complaint_period_deadline: trustapTimestamp.optional(),
	})
	.strict();

export const webhooksRoute = createRouter().post(
	'/trustap/transaction-update',
	authenticateTrustapWebhook,
	async (c) => {
		let parsedBody: unknown;
		try {
			parsedBody = parseJsonWithTopLevelTrustapId(await c.req.text(), 'transaction_id');
		} catch {
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
						status: orders.status,
						paymentCancellationState: orders.payment_cancellation_state,
						paymentCreationState: orders.payment_creation_state,
					})
					.from(orders)
					.where(eq(orders.payment_transaction_id, payload.transaction_id))
					.limit(1);
				if (!order) {
					console.warn(`Order not found for transaction ${payload.transaction_id}`);
					return c.json({ error: 'Order not found' }, 404);
				}
				const transition = resolveTrustapOrderTransition(trustapTransaction.status, order.status, payload.status);
				const resolvesCancellation =
					isAuthoritativeCancellationStatus(payload.status) &&
					order.paymentCancellationState === PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED;
				const complaintRequiresReconciliation =
					transition.apply &&
					payload.status === entityTrustapTransactionTypeValues.COMPLAINED &&
					order.paymentCreationState !== PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED;
				const resolvesCreationReconciliation =
					order.paymentCreationState === PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED &&
					isAuthoritativeCreationResolutionStatus(payload.status);
				if (
					!transition.apply &&
					!resolvesCancellation &&
					!complaintRequiresReconciliation &&
					!resolvesCreationReconciliation
				) {
					return c.json({ success: true, message: 'Transaction update ignored' }, 200);
				}
				if (await shippingLabelPurchaseDefersOrderTransition(tx, order.id)) {
					return c.json({ error: SHIPPING_LABEL_TRANSITION_DEFERRED }, 503);
				}

				// Update transaction status
				if (transition.apply) {
					const [updatedTransaction] = await tx
						.update(entityTrustapTransactions)
						.set({
							status: transition.providerStatus,
							updated_at: new Date(),
							...(payload.complaint_period_deadline && {
								complaintPeriodDeadline: new Date(payload.complaint_period_deadline),
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
						status: transition.orderStatus,
						...(payload.status === entityTrustapTransactionTypeValues.COMPLAINED
							? { payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED }
							: resolvesCreationReconciliation
								? { payment_creation_state: PAYMENT_CREATION_STATES.CREATED }
								: {}),
						...(isAuthoritativeCancellationStatus(payload.status)
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
