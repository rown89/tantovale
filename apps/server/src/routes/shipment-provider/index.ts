import z from 'zod/v4';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';

import { createRouter } from '#lib/create-app';
import { createClient } from '#create-client';
import { orders } from '#db-schema';
import { ORDER_PHASES } from '#database/schemas/enumerated_values';
import { activeCarriersDescription, createLabelDescription } from './describe';
import { authPath, SHIPPING_ERROR_MESSAGES } from '#utils/constants';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { ShipmentService, ShippoProviderError } from './shipment.service';

const calculateShipmentCostSchema = z.object({
	item_id: z.number().int().positive('Item ID must be a positive integer'),
});

const createLabelSchema = z.object({
	order_id: z.number().int().positive(),
	rate_id: z.string().trim().min(1),
});

const ERROR_MESSAGES = {
	ITEM_NOT_FOUND: 'Item not found or not available',
	SELLER_ADDRESS_NOT_FOUND: 'Seller address not found',
	BUYER_PROFILE_NOT_FOUND: 'Buyer profile not found',
	UNAUTHORIZED_ACCESS: 'You do not have permission to access this item',
	...SHIPPING_ERROR_MESSAGES,
} as const;

export const shipmentProviderRoute = createRouter()
	.get(`/${authPath}/active_carriers`, authMiddleware, describeRoute(activeCarriersDescription), async (c) => {
		try {
			const activeCarriers = await new ShipmentService().listActiveCarriers();
			if (activeCarriers.length === 0) {
				return c.json({ message: 'No active carriers found' }, 404);
			}
			return c.json({ activeCarriers }, 200);
		} catch {
			return c.json({ message: 'Failed to fetch active carriers' }, 502);
		}
	})
	.post(
		`/${authPath}/calculate_shipment_cost`,
		authMiddleware,
		zValidator('json', calculateShipmentCostSchema),
		async (c) => {
			try {
				const user = c.get('user');

				const { item_id } = c.req.valid('json');

				if (!user) {
					return c.json({ message: 'User not authenticated' }, 401);
				}

				// get profile_id from user
				const profile_id = user.profile_id;

				const quote = await new ShipmentService().createShippingQuote(item_id, profile_id, user.email);
				return c.json({ rates: [quote] }, 200);
			} catch (error) {
				if (error instanceof ShippoProviderError) {
					return c.json({ message: 'Shipping provider request failed' }, 502);
				}
				if (error instanceof Error) {
					const errorMessage = error.message;
					if (
						Object.values(ERROR_MESSAGES).includes(errorMessage as (typeof ERROR_MESSAGES)[keyof typeof ERROR_MESSAGES])
					) {
						return c.json({ message: errorMessage }, 400);
					}
				}

				return c.json({ message: 'Internal server error' }, 500);
			}
		},
	)
	.post(
		`/${authPath}/create_label`,
		describeRoute(createLabelDescription),
		zValidator('json', createLabelSchema),
		async (c) => {
			const user = c.get('user');
			if (!user) return c.json({ message: 'User not authenticated' }, 401);
			const { order_id, rate_id } = c.req.valid('json');
			const { db } = createClient();
			const [order] = await db
				.select({
					id: orders.id,
					seller_id: orders.seller_id,
					shipping_label_id: orders.shipping_label_id,
					status: orders.status,
				})
				.from(orders)
				.where(and(eq(orders.id, order_id), eq(orders.seller_id, user.profile_id)));
			if (!order) return c.json({ message: 'Order not found' }, 404);
			if (order.status !== ORDER_PHASES.PAYMENT_CONFIRMED && order.status !== ORDER_PHASES.SHIPPING_PENDING) {
				return c.json({ message: 'Order is not ready for label purchase' }, 409);
			}
			try {
				const transaction = await new ShipmentService().purchaseLabel(rate_id, order.shipping_label_id);
				return c.json(
					{
						label: {
							id: transaction.objectId,
							status: transaction.status,
							label_url: transaction.labelUrl,
							tracking_number: transaction.trackingNumber,
							tracking_url: transaction.trackingUrlProvider,
						},
					},
					201,
				);
			} catch (error) {
				if (error instanceof ShippoProviderError) {
					if (error.operation === 'get_rate' && error.status === 404) {
						return c.json({ message: 'Shipping rate not found' }, 400);
					}
					return c.json({ message: 'Shipping provider request failed' }, 502);
				}
				if (error instanceof Error && error.message === SHIPPING_ERROR_MESSAGES.SHIPPING_LABEL_NOT_FOUND) {
					return c.json({ message: 'Shipping rate does not belong to this order' }, 400);
				}
				return c.json({ message: 'Internal server error' }, 500);
			}
		},
	);
