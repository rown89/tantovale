import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { createRouter } from '../../lib/create-app';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { createClient } from '../../database/index';
import { profiles, orders, addresses, items } from '#db-schema';
import { PaymentProviderService } from './payment-provider.service';
import { ShipmentService } from '../shipment-provider/shipment.service';

export const paymentsRoute = createRouter().post(
	'/pay_order',
	authMiddleware,
	zValidator(
		'json',
		z.object({
			item_id: z.number(),
		}),
	),
	async (c) => {
		const user = c.var.user;

		const { item_id } = c.req.valid('json');

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				// Step 1: Get the item
				const [item] = await tx
					.select({
						profile_id: items.profile_id,
						price: items.price,
					})
					.from(items)
					.where(eq(items.id, item_id));

				if (!item) {
					throw new Error('Item not found');
				}

				// Step 2: Get more informations about the profile
				const [profile] = await tx
					.select({
						name: profiles.name,
						surname: profiles.surname,
						payment_provider_id: profiles.payment_provider_id,
					})
					.from(profiles)
					.where(eq(profiles.id, user.profile_id));

				if (!profile) {
					throw new Error('User has no name or surname or payment_provider_id');
				}

				// Step 3: Create a new payment provider guest user for the user (buyer) if he has no payment_provider_id
				const buyerPaymentProviderId = profile.payment_provider_id!;

				// Step 4: Get the seller payment provider ID
				const [sellerProfile] = await tx
					.select({
						payment_provider_id: profiles.payment_provider_id,
					})
					.from(profiles)
					.where(eq(profiles.id, item.profile_id));

				if (!sellerProfile) {
					throw new Error('Seller profile not found');
				}

				const sellerPaymentProviderId = sellerProfile.payment_provider_id!;

				// Step 5: Calculate shipping cost
				const shipmentService = new ShipmentService();
				const shippingCost = await shipmentService.calculateShippingCost(item_id, user.profile_id, user.email);

				if (!shippingCost) {
					throw new Error('Failed to calculate shipping cost');
				}

				// Step 6: Calculate the total price
				const totalPrice = item.price / 100 + shippingCost;

				// Step 7: Calculate the transaction fee
				const paymentProviderService = new PaymentProviderService();
				const transactionFee = await paymentProviderService.calculateTransactionFee({
					price: totalPrice,
					currency: 'eur',
				});

				if (!transactionFee) {
					throw new Error('Failed to calculate transaction fee');
				}

				// Step 8: Create the payment transaction
				const transaction = await paymentProviderService.createTransaction({
					buyer_id: buyerPaymentProviderId,
					seller_id: sellerPaymentProviderId,
					creator_role: 'buyer',
					currency: 'eur',
					description: `Transaction for item ${item_id}`,
					price: totalPrice,
					charge: transactionFee.charge,
					charge_calculator_version: transactionFee.charge_calculator_version,
				});

				if (!transaction) {
					throw new Error('Failed to create payment transaction');
				}

				return c.json({}, 200);
			});
		} catch (error) {
			console.error('Payment completion error:', error);

			// Return appropriate error response based on the error type
			if (error instanceof Error) {
				return c.json({ error: error.message }, 400);
			}

			return c.json({ error: 'Failed to complete payment' }, 500);
		}
	},
);
