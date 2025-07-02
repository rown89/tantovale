import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { entityTrustapTransactions, orders } from '#db-schema';
import { EntityTrustapTransactionStatus } from '#database/schemas/enumerated_values';

// Trustap webhook payload schema
const trustapWebhookSchema = z.object({
	event: z.string(),
	transaction_id: z.number(),
	status: z.string(),
	paid: z.string().optional(),
	funds_released: z.string().optional(),
	complaint_period_deadline: z.string().optional(),
	// Add other fields as needed based on Trustap webhook documentation
});

export const webhooksRoute = createRouter().post(
	'/trustap/transaction-update',
	zValidator('json', trustapWebhookSchema),
	async (c) => {
		const payload = c.req.valid('json');
		const { db } = createClient();

		try {
			// Verify webhook signature if Trustap provides one
			// const signature = c.req.header('X-Trustap-Signature');
			// if (!verifyWebhookSignature(payload, signature)) {
			// 	return c.json({ error: 'Invalid signature' }, 401);
			// }

			return await db.transaction(async (tx) => {
				// Find the transaction in our database
				const [trustapTransaction] = await tx
					.select()
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, payload.transaction_id))
					.limit(1);

				if (!trustapTransaction) {
					console.error(`Transaction ${payload.transaction_id} not found in database`);
					return c.json({ error: 'Transaction not found' }, 404);
				}

				// Update transaction status
				const [updatedTransaction] = await tx
					.update(entityTrustapTransactions)
					.set({
						status: payload.status as EntityTrustapTransactionStatus,
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
						status: payload.status,
						updated_at: new Date(),
					})
					.where(eq(orders.payment_transaction_id, payload.transaction_id))
					.returning();

				if (!updatedOrder) {
					console.warn(`Order not found for transaction ${payload.transaction_id}`);
				}

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

					case 'disputed':
						// Transaction is in dispute
						console.log(`Transaction ${payload.transaction_id} is in dispute`);
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
