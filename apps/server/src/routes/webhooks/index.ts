import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { entityTrustapTransactions, orders } from '#db-schema';
import { entityTrustapTransactionStatusValues, PAYMENT_CANCELLATION_STATES } from '#database/schemas/enumerated_values';
import { resolveTrustapOrderTransition } from '../payments/trustap-order-state';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';
import { environment } from '#utils/constants';
import { canonicalTrustapId, parseJsonWithTopLevelTrustapId } from '../payments/trustap-int64';

// Trustap webhook payload schema
const trustapWebhookSchema = z.object({
	event: z.string(),
	transaction_id: z.union([z.string(), z.number()]).transform((value, context) => {
		const id = canonicalTrustapId(value);
		if (!id) context.addIssue({ code: 'custom', message: 'Invalid transaction id' });
		return id as string;
	}),
	status: z.enum(entityTrustapTransactionStatusValues),
	paid: z.string().optional(),
	funds_released: z.string().optional(),
	complaint_period_deadline: z.string().optional(),
	// Add other fields as needed based on Trustap webhook documentation
});

function secureEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidTrustapBasicAuth(authorization: string | undefined): boolean {
	if (!authorization?.startsWith('Basic ')) return false;
	let decoded: string;
	try {
		decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
	} catch {
		return false;
	}
	const separator = decoded.indexOf(':');
	if (separator < 0) return false;
	return (
		secureEqual(decoded.slice(0, separator), environment.PAYMENT_PROVIDER_WEBHOOK_USERNAME) &&
		secureEqual(decoded.slice(separator + 1), environment.PAYMENT_PROVIDER_WEBHOOK_SECRET)
	);
}

const authenticateTrustapWebhook: MiddlewareHandler = async (c, next) => {
	if (!hasValidTrustapBasicAuth(c.req.header('authorization'))) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
};

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
				// Find the transaction in our database
				const [trustapTransaction] = await tx
					.select()
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, payload.transaction_id))
					.for('update')
					.limit(1);

				if (!trustapTransaction) {
					console.error(`Transaction ${payload.transaction_id} not found in database`);
					return c.json({ error: 'Transaction not found' }, 404);
				}
				if (trustapTransaction.entityId === null) {
					return c.json({ error: 'Transaction item not found' }, 404);
				}
				await acquireItemCommerceLock(tx, trustapTransaction.entityId);
				const [order] = await tx
					.select({ id: orders.id, status: orders.status })
					.from(orders)
					.where(eq(orders.payment_transaction_id, payload.transaction_id))
					.limit(1);
				if (!order) {
					console.warn(`Order not found for transaction ${payload.transaction_id}`);
					return c.json({ error: 'Order not found' }, 404);
				}
				const transition = resolveTrustapOrderTransition(trustapTransaction.status, order.status, payload.status);
				if (!transition.apply) {
					return c.json({ success: true, message: 'Transaction update ignored' }, 200);
				}

				// Update transaction status
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

				if (!updatedTransaction) {
					throw new Error('Failed to update transaction status');
				}

				// Update corresponding order status
				const [updatedOrder] = await tx
					.update(orders)
					.set({
						status: transition.orderStatus,
						...(['rejected', 'cancelled', 'cancelled_with_payment', 'payment_refunded'].includes(payload.status)
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
