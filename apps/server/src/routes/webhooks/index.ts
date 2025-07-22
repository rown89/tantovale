import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { entityTrustapTransactions, orders } from '#db-schema';
import { EntityTrustapTransactionStatus } from '#database/schemas/enumerated_values';

// Trustap event codes
const TrustapEventCode = z.enum([
	// Online transaction events
	'basic_tx.joined',
	'basic_tx.rejected',
	'basic_tx.cancelled',
	'basic_tx.claimed',
	'basic_tx.listing_transaction_accepted',
	'basic_tx.listing_transaction_rejected',
	'basic_tx.payment_failed',
	'basic_tx.paid',
	'basic_tx.payment_refunded',
	'basic_tx.payment_review_flagged',
	'basic_tx.payment_review_finished',
	'basic_tx.tracking_details_submission_deadline_extended',
	'basic_tx.tracked',
	'basic_tx.delivered',
	'basic_tx.complained',
	'basic_tx.complaint_period_ended',
	'basic_tx.funds_released',
	'basic_tx.funds_refunded',
]);

// Trustap webhook payload schema based on official documentation
const trustapWebhookSchema = z.object({
	code: TrustapEventCode,
	user_id: z.string().nullable().optional(), // ID of user who triggered event
	target_id: z.string(), // Transaction ID as string
	target_preview: z
		.object({
			id: z.number(),
			status: z.string(),
			currency: z.string(),
			quantity: z.number().optional(),
			price: z.number().optional(),
			charge: z.number().optional(),
			charge_seller: z.number().optional(),
			description: z.string().optional(),
			created: z.string(), // ISO date string
			is_payment_in_progress: z.boolean().optional(),
			client_id: z.string().optional(),
			buyer_id: z.string().optional(),
			seller_id: z.string().optional(),
			joined: z.string().optional(), // ISO date string
			// P2P specific fields
			deposit_pricing: z
				.object({
					price: z.number(),
					charge: z.number(),
				})
				.optional(),
			skip_remainder: z.boolean().optional(),
		})
		.optional(),
	time: z.string(), // ISO date string when event occurred
	metadata: z.record(z.string(), z.any()).optional(), // Additional metadata
});

// Helper function to verify Basic Authentication (you should configure these credentials)
function verifyBasicAuth(authHeader: string | undefined): boolean {
	if (!authHeader || !authHeader.startsWith('Basic ')) {
		return false;
	}

	// TODO: Configure these credentials in your environment
	const expectedUsername = process.env.TRUSTAP_WEBHOOK_USERNAME || 'trustap_user';
	const expectedPassword = process.env.TRUSTAP_WEBHOOK_PASSWORD || 'trustap_password';

	const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
	const [username, password] = credentials.split(':');

	return username === expectedUsername && password === expectedPassword;
}

export const webhooksRoute = createRouter().post(
	'/trustap/transaction-update',
	zValidator('json', trustapWebhookSchema),
	async (c) => {
		const payload = c.req.valid('json');
		const { db } = createClient();

		try {
			// Verify Basic Authentication
			const authHeader = c.req.header('Authorization');
			if (!verifyBasicAuth(authHeader)) {
				console.error('Unauthorized webhook request - invalid credentials');
				return c.json({ error: 'Unauthorized' }, 401);
			}

			// Convert target_id to number for database lookup
			const transactionId = parseInt(payload.target_id, 10);

			if (isNaN(transactionId)) {
				console.error(`Invalid transaction ID: ${payload.target_id}`);
				return c.json({ error: 'Invalid transaction ID' }, 400);
			}

			return await db.transaction(async (tx) => {
				// Find the transaction in our database
				const [trustapTransaction] = await tx
					.select()
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, transactionId))
					.limit(1);

				if (!trustapTransaction) {
					console.error(`Transaction ${transactionId} not found in database`);
					return c.json({ error: 'Transaction not found' }, 404);
				}

				// Map Trustap event codes to internal status
				const getInternalStatus = (code: string): string => {
					switch (code) {
						case 'basic_tx.joined':

						case 'basic_tx.paid':

						case 'basic_tx.funds_released':

						case 'basic_tx.tracked':

						case 'basic_tx.delivered':

						case 'basic_tx.complained':

						case 'basic_tx.rejected':

						case 'basic_tx.cancelled':

						default:
							return payload.target_preview?.status || code;
					}
				};

				const internalStatus = getInternalStatus(payload.code);

				// Update transaction status
				const [updatedTransaction] = await tx
					.update(entityTrustapTransactions)
					.set({
						status: internalStatus as EntityTrustapTransactionStatus,
						updated_at: new Date(),
					})
					.where(eq(entityTrustapTransactions.transactionId, transactionId))
					.returning();

				if (!updatedTransaction) {
					throw new Error('Failed to update transaction status');
				}

				// Update corresponding order status
				const [updatedOrder] = await tx
					.update(orders)
					.set({
						status: internalStatus,
						updated_at: new Date(),
					})
					.where(eq(orders.payment_transaction_id, transactionId))
					.returning();

				if (!updatedOrder) {
					console.warn(`Order not found for transaction ${transactionId}`);
				}

				// Handle specific event codes
				switch (payload.code) {
					case 'basic_tx.paid':

					case 'basic_tx.funds_released':

					case 'basic_tx.complained':

					case 'basic_tx.delivered':

					case 'basic_tx.cancelled':

					case 'basic_tx.payment_failed':

					default:
						console.log(`Transaction ${transactionId} event: ${payload.code}`);
				}

				// Log webhook event for audit
				console.log(`Trustap webhook processed: ${payload.code} for transaction ${transactionId} at ${payload.time}`);

				return c.json(
					{
						success: true,
						message: 'Transaction updated successfully',
						transaction_id: transactionId,
						event_code: payload.code,
						status: internalStatus,
					},
					200,
				);
			});
		} catch (error) {
			console.error('Error processing Trustap webhook:', error);
			return c.json({ error: 'Internal server error' }, 500);
		}
	},
);
