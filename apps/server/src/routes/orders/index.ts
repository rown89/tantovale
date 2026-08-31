import { and, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { createClient } from '#database/index';
import { ORDER_PHASES } from '#database/schemas/enumerated_values';
import { addresses, cities, items, orders, profiles, users } from '#db-schema';
import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { authPath } from '#utils/constants';

const postgresIntegerMax = 2_147_483_647;
const orderStatuses = new Set<string>(Object.values(ORDER_PHASES));

function parseResourceId(value: string): number | undefined {
	if (!/^[1-9]\d*$/.test(value)) return undefined;
	const id = Number(value);
	return Number.isSafeInteger(id) && id <= postgresIntegerMax ? id : undefined;
}

export const ordersRoute = createRouter()
	.get(`${authPath}/status/:status`, authMiddleware, async (c) => {
		const user = c.var.user;
		const status = c.req.param('status') ?? '';
		if (status !== 'all' && !orderStatuses.has(status)) {
			// Keep the status-list RPC body array-shaped for existing shared consumers.
			return c.json([], 400);
		}

		const { db } = createClient();
		const cityAlias = alias(cities, 'city');
		const provinceAlias = alias(cities, 'province');
		const participant = or(eq(orders.buyer_id, user.profile_id), eq(orders.seller_id, user.profile_id));
		const predicate = status === 'all' ? participant : and(participant, eq(orders.status, status));
		const userOrders = await db
			.select()
			.from(orders)
			.innerJoin(items, eq(orders.item_id, items.id))
			.innerJoin(profiles, eq(orders.seller_id, profiles.id))
			.innerJoin(users, eq(profiles.user_id, users.id))
			.innerJoin(addresses, eq(orders.buyer_address, addresses.id))
			.innerJoin(cityAlias, eq(addresses.city_id, cityAlias.id))
			.innerJoin(provinceAlias, eq(addresses.province_id, provinceAlias.id))
			.where(predicate);

		return c.json(
			userOrders.map((order) => ({
				id: order.orders.id,
				status: order.orders.status as (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES],
				original_price: order.items.price,
				payment_provider_charge: order.orders.payment_provider_charge,
				platform_charge: order.orders.platform_charge,
				shipping_price: order.orders.shipping_price,
				shipping_label_id: order.orders.shipping_label_id,
				item: { id: order.items.id, title: order.items.title },
				seller: { id: order.users.id, username: order.users.username },
				buyer: {
					street_address: order.addresses.street_address,
					civic_number: order.addresses.civic_number,
					city: order.city.name,
					province: order.province.name,
					postal_code: order.addresses.postal_code,
					country_code: order.addresses.country_code,
				},
				updated_at: order.orders.updated_at,
				created_at: order.orders.created_at,
			})),
			200,
		);
	})
	.get(`${authPath}/:id`, authMiddleware, async (c) => {
		const id = parseResourceId(c.req.param('id'));
		if (!id) return c.json({ error: 'Invalid order ID' }, 400);

		const user = c.var.user;
		const { db } = createClient();
		const [order] = await db
			.select()
			.from(orders)
			.where(and(eq(orders.id, id), or(eq(orders.buyer_id, user.profile_id), eq(orders.seller_id, user.profile_id))))
			.limit(1);

		if (!order) return c.json({ error: 'Order not found' }, 404);
		return c.json(order, 200);
	});
