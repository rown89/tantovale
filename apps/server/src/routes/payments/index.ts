import { zValidator } from '@hono/zod-validator';
import { and, eq, not } from 'drizzle-orm';
import { z } from 'zod';

import { createRouter } from '../../lib/create-app';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { createClient } from '../../database/index';
import { profiles, orders, items, entityTrustapTransactions } from '#db-schema';
import { PaymentProviderService } from './payment-provider.service';
import { calculatePlatformCosts } from '#utils/platform-costs';
import { ORDER_PHASES } from '#utils/order-phases';
import { environment } from '#utils/constants';

export const paymentsRoute = createRouter().post(
	'/buy_now',
	authMiddleware,
	zValidator('json', z.object({ item_id: z.number() })),
	async (c) => {
		const user = c.var.user;

		const { item_id } = c.req.valid('json');

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				// 1. Validate item availability
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
						price: items.price,
						status: items.status,
						published: items.published,
						payment_provider_id: profiles.payment_provider_id,
					})
					.from(items)
					.where(and(eq(items.id, item_id), eq(items.status, 'available'), eq(items.published, true)))
					.limit(1);

				if (!item) {
					return c.json({ error: 'Item not available' }, 400);
				}

				// 2. Check if an order already exists and is in a different status than payment_pending
				const [existingOrder] = await tx
					.select({ id: orders.id })
					.from(orders)
					.where(and(eq(orders.item_id, item_id), not(eq(orders.status, ORDER_PHASES.PAYMENT_PENDING))))
					.limit(1);

				if (existingOrder) {
					return c.json({ error: 'Item already sold' }, 400);
				}

				// 3. Get buyer payment provider id
				const [buyerInfo] = await tx
					.select({ payment_provider_id: profiles.payment_provider_id })
					.from(profiles)
					.where(eq(profiles.id, user.profile_id))
					.limit(1);

				if (!buyerInfo || !buyerInfo.payment_provider_id) {
					return c.json({ error: 'Buyer information not found or buyer has no payment provider id' }, 404);
				}

				// 4. Calculate platform costs
				const { shipping_price, payment_provider_charge, platform_charge } = await calculatePlatformCosts(
					{
						item_id,
						price: item.price,
						buyer_profile_id: user.profile_id,
						buyer_email: user.email,
					},
					{
						shipping: true,
						payment_provider_charge: true,
						platform_charge: true,
					},
				);

				if (!shipping_price || !payment_provider_charge || !platform_charge) {
					return c.json({ error: 'Failed to calculate platforms costs' }, 500);
				}

				const paymentProviderService = new PaymentProviderService();

				// 5. Create Trustap transaction
				const totalPrice = item.price + shipping_price + platform_charge;
				const transaction = await paymentProviderService.createTransaction({
					buyer_id: buyerInfo.payment_provider_id,
					seller_id: item.payment_provider_id,
					creator_role: 'buyer',
					currency: 'eur',
					description: `Payment for ${item.title}`,
					price: totalPrice,
					charge: payment_provider_charge,
					charge_calculator_version: 1,
				});

				if (!transaction) {
					return c.json({ error: 'Failed to create Trustap transaction' }, 500);
				}

				// 6. Store transaction details
				const [trustapTransaction] = await tx
					.insert(entityTrustapTransactions)
					.values({
						entityId: item_id,
						sellerId: transaction.seller_id,
						buyerId: transaction.buyer_id,
						transactionId: transaction.id,
						transactionType: 'online_payment',
						status: transaction.status,
						price: totalPrice,
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

				// 7. Create new order
				const [newOrder] = await tx
					.insert(orders)
					.values({
						item_id,
						buyer_id: user.profile_id,
						seller_id: item.profile_id,
						total_price: item.price,
						shipping_price,
						payment_provider_charge,
						platform_charge,
						payment_transaction_id: transaction.id,
					})
					.returning();

				if (!newOrder) {
					return c.json({ error: 'Failed to create order' }, 500);
				}

				// 8. Return payment URL
				return c.json(
					{
						success: true,
						order: { id: newOrder.id, status: newOrder.status },
						payment_url: `${environment.PAYMENT_PROVIDER_PAY_PAGE_URL}/${transaction.id}/?redirect_url=${environment.POST_PAYMENT_REDIRECT_URL}`,
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
