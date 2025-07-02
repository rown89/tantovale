import { zValidator } from '@hono/zod-validator';
import { and, eq, not } from 'drizzle-orm';
import { z } from 'zod/v4';

import { createRouter } from '../../lib/create-app';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { createClient } from '../../database/index';
import { profiles, orders, items, entityTrustapTransactions, addresses, shippings } from '#db-schema';
import { PaymentProviderService } from './payment-provider.service';
import { calculatePlatformCosts } from '#utils/platform-costs';
import { ORDER_PHASES } from '#utils/order-phases';
import { environment } from '#utils/constants';
import { addressStatus, EntityTrustapTransactionStatus, itemStatus } from '#database/schemas/enumerated_values';
import { ShipmentService } from '../shipment-provider/shipment.service';
import { formatPriceToCents } from '#utils/price-formatter';

const paymentBuyNowSchema = z.object({
	item_id: z.number(),
});

export const paymentsRoute = createRouter().post(
	'/buy_now',
	authMiddleware,
	zValidator('json', paymentBuyNowSchema),
	async (c) => {
		const user = c.var.user;

		const { item_id } = c.req.valid('json');

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				//  Validate item availability
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
						price: items.price,
						status: items.status,
						published: items.published,
						payment_provider_id: profiles.payment_provider_id,
						seller_address_id: addresses.id,
					})
					.from(items)
					.where(and(eq(items.id, item_id), eq(items.status, itemStatus.AVAILABLE), eq(items.published, true)))
					.limit(1);

				if (!item) {
					return c.json({ error: 'Item not available' }, 400);
				}

				// Check if an order already exists and is in a different status than payment_pending
				const [existingOrder] = await tx
					.select({ id: orders.id })
					.from(orders)
					.where(and(eq(orders.item_id, item_id), not(eq(orders.status, ORDER_PHASES.PAYMENT_PENDING))))
					.limit(1);

				if (existingOrder) {
					return c.json({ error: 'Item already sold' }, 400);
				}

				// Get buyer payment provider id
				const [buyerInfo] = await tx
					.select({ payment_provider_id: profiles.payment_provider_id, address_id: addresses.id })
					.from(profiles)
					.innerJoin(addresses, and(eq(profiles.id, addresses.profile_id), eq(addresses.status, addressStatus.ACTIVE)))
					.where(eq(profiles.id, user.profile_id))
					.limit(1);

				if (!buyerInfo || !buyerInfo.payment_provider_id) {
					return c.json({ error: 'Buyer information not found or buyer has no payment provider id' }, 404);
				}

				// Create a shipping label
				const shipmentService = new ShipmentService();
				const { rates } = await shipmentService.calculateShippingCostWithRates(item_id, user.profile_id, user.email);
				const labelPreview = rates[0];

				const shipping_label_id = labelPreview?.shipment;

				if (!labelPreview || !shipping_label_id) {
					return c.json({ error: 'Failed to generate a label preview' }, 500);
				}

				const shipping_price = labelPreview?.amount ? formatPriceToCents(parseFloat(labelPreview.amount)) : 0;

				// Calculate platform costs
				const { platform_charge } = await calculatePlatformCosts(
					{
						price: item.price,
					},
					{
						platform_charge: true,
					},
				);

				if (!platform_charge) {
					return c.json({ error: 'Failed to calculate platform charge' }, 500);
				}

				// Calculate payment provider charge
				const { payment_provider_charge, payment_provider_charge_calculator_version } = await calculatePlatformCosts(
					{
						price: item.price,
						postage_fee: shipping_price,
					},
					{
						payment_provider_charge: true,
					},
				);

				if (!payment_provider_charge || !payment_provider_charge_calculator_version) {
					return c.json({ error: 'Failed to calculate payment provider charge' }, 500);
				}

				const paymentProviderService = new PaymentProviderService();

				// Create Trustap transaction
				const transactionPrice = item.price + payment_provider_charge;

				const transaction = await paymentProviderService.createTransactionWithBothUsers({
					buyer_id: buyerInfo.payment_provider_id,
					seller_id: item.payment_provider_id,
					creator_role: 'buyer',
					currency: 'eur',
					description: `Payment for ${item.title}`,
					price: transactionPrice,
					postage_fee: shipping_price,
					charge: payment_provider_charge,
					charge_calculator_version: payment_provider_charge_calculator_version,
				});

				if (!transaction) {
					return c.json({ error: 'Failed to create Trustap transaction' }, 500);
				}

				// Store transaction details
				const [trustapTransaction] = await tx
					.insert(entityTrustapTransactions)
					.values({
						entityId: item_id,
						sellerId: transaction.seller_id,
						buyerId: transaction.buyer_id,
						transactionId: transaction.id,
						transactionType: 'online_payment',
						status: transaction.status as EntityTrustapTransactionStatus,
						price: transactionPrice,
						charge: payment_provider_charge,
						chargeSeller: transaction.charge_seller || 0,
						currency: 'eur',
						entityTitle: item.title,
						claimedBySeller: false,
						claimedByBuyer: false,
						complaintPeriodDeadline: null, // Will be set by webhook
					})
					.returning();

				if (!trustapTransaction) {
					return c.json({ error: 'Failed to store Trustap transaction' }, 500);
				}

				// Create new order
				const [newOrder] = await tx
					.insert(orders)
					.values({
						item_id,
						buyer_id: user.profile_id,
						seller_id: item.profile_id,
						buyer_address: buyerInfo.address_id,
						seller_address: item.seller_address_id,
						shipping_price,
						payment_provider_charge,
						platform_charge,
						payment_transaction_id: transaction.id,
					})
					.returning();

				if (!newOrder) {
					return c.json({ error: 'Failed to create order' }, 500);
				}

				// Create shipping record with label ID
				await tx.insert(shippings).values({
					order_id: newOrder.id,
					shipping_label_id,
				});

				// Return payment URL
				return c.json(
					{
						success: true,
						order: { id: newOrder.id, status: newOrder.status },
						payment_url: `${environment.PAYMENT_PROVIDER_PAY_PAGE_URL}/${transaction.id}/?redirect_url=${environment.POST_PAYMENT_REDIRECT_URL}/auth/profile/orders`,
						message: 'Complete payment to confirm order',
					},
					200,
				);
			});
		} catch (error) {
			console.error('Buy now error:', error);
			return c.json({ error: 'Failed to process purchase' }, 500);
		}
	},
);
