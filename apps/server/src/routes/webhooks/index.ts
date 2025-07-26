import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { entityTrustapTransactions, orders, chat_rooms, users, items, shippings } from '#db-schema';
import { sendOrderPaidNotificationBuyer, sendOrderPaidNotificationSeller } from '#mailer/index';
import { ORDER_PHASES } from '#utils/order-phases';
import { ShipmentService } from '../shipment-provider/shipment.service';

// Trustap event codes (Online transaction events)
const TrustapEventCode = z.enum([
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

export const webhooksRoute = createRouter()
	.post('/trustap/transaction-update', zValidator('json', trustapWebhookSchema), async (c) => {
		const payload = c.req.valid('json');
		const { db } = createClient();

		try {
			// TODO: Verify Basic Authentication for the webhook

			// Convert target_id to number for database lookup
			const payload_transactionId = parseInt(payload.target_id, 10);

			if (isNaN(payload_transactionId)) {
				return c.json({ error: 'Invalid transaction ID' }, 400);
			}

			return await db.transaction(async (tx) => {
				// Create aliases for buyer and seller users
				const buyerUser = alias(users, 'buyer_user');
				const sellerUser = alias(users, 'seller_user');

				// Main query to get order infos and users infos
				const [order] = await tx
					.select({
						id: orders.id,
						item_title: items.title,
						sp_shipment_id: shippings.sp_shipment_id,
						buyer_id: orders.buyer_id,
						seller_id: orders.seller_id,
						item_id: orders.item_id,
						transaction_id: entityTrustapTransactions.transactionId,
						buyer_email: buyerUser.email,
						buyer_username: buyerUser.username,
						seller_email: sellerUser.email,
						seller_username: sellerUser.username,
					})
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, payload_transactionId))
					.innerJoin(orders, eq(entityTrustapTransactions.entityId, orders.id))
					.innerJoin(items, eq(orders.item_id, items.id))
					.innerJoin(shippings, eq(orders.id, shippings.order_id))
					.innerJoin(buyerUser, eq(buyerUser.id, orders.buyer_id))
					.innerJoin(sellerUser, eq(sellerUser.id, orders.seller_id))
					.limit(1);

				if (!order) {
					console.error(`Order ${payload_transactionId} not found in database`);
					return c.json({ error: 'Order not found' }, 404);
				}

				// Get the room id
				const [room] = await db
					.select({
						id: chat_rooms.id,
					})
					.from(chat_rooms)
					.where(eq(chat_rooms.item_id, order.item_id))
					.limit(1);

				if (!room) {
					return c.json({ error: 'Room not found' }, 404);
				}

				// Handle specific event codes
				switch (payload.code) {
					case 'basic_tx.paid':
						// Update the order
						await tx
							.update(orders)
							.set({
								status: ORDER_PHASES.PAYMENT_CONFIRMED,
								updated_at: new Date(),
							})
							.where(eq(orders.id, order.id));

						const shipmentService = new ShipmentService();

						/*
						 * Generate the Shipment Label.
						 * I'm retrieving the rate from the order with the Shippo shipment id (sp_shipment_id) and generate the label.
						 */
						const shipmentLabel = await shipmentService.generateShipmentLabel(order.sp_shipment_id, order.id);

						if (!shipmentLabel) {
							throw new Error('Failed to generate shipment label');
						}

						// Update the order related shipping with the shipment label ID
						await tx
							.update(shippings)
							.set({ sp_shipment_label_id: shipmentLabel.objectId })
							.where(eq(orders.id, order.id));

						// Send email to the buyer
						await sendOrderPaidNotificationBuyer({
							to: order.buyer_email,
							orderId: order.id,
							roomId: room.id,
						});

						// Send email to the seller
						await sendOrderPaidNotificationSeller({
							to: order.seller_email,
							item_name: order.item_title,
							buyer_name: order.buyer_username,
							roomId: room.id,
							labelUrl: shipmentLabel.labelUrl,
						});

					case 'basic_tx.funds_released':

					case 'basic_tx.complained':

					case 'basic_tx.delivered':

					case 'basic_tx.cancelled':

					case 'basic_tx.payment_failed':

					default:
						console.log(`Transaction ${payload_transactionId} event: ${payload.code}`);
				}

				// Update transaction status
				const [updatedTransaction] = await tx
					.update(entityTrustapTransactions)
					.set({
						status: payload.code,
						updated_at: new Date(),
					})
					.where(eq(entityTrustapTransactions.transactionId, payload_transactionId))
					.returning();

				if (!updatedTransaction) {
					throw new Error('Failed to update transaction status');
				}

				// Log webhook event for audit
				console.log(
					`Trustap webhook processed: ${payload.code} for transaction ${payload_transactionId} at ${payload.time}`,
				);

				return c.json(
					{
						success: true,
						message: 'Transaction updated successfully',
						transaction_id: payload_transactionId,
						event_code: payload.code,
						status: payload.target_preview?.status,
					},
					200,
				);
			});
		} catch (error) {
			console.error('Error processing Trustap webhook:', error);
			return c.json({ error: 'Internal server error' }, 500);
		}
	})
	.post(
		'shippo/shipment-update',
		zValidator(
			'json',
			z.object({
				shipment_id: z.string(),
				status: z.string(),
				tracking_number: z.string(),
				tracking_url: z.string(),
				carrier: z.string(),
				service: z.string(),
			}),
		),
		async (c) => {
			const payload = c.req.valid('json');
			// TODO: Update the order status

			return c.json({ success: true }, 200);
		},
	);
