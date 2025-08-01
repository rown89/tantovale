import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { createClient } from '#database/index';
import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import {
	items,
	users,
	property_values,
	orders,
	items_properties_values,
	profiles,
	addresses,
	cities,
} from '#db-schema';
import { authPath } from '#utils/constants';
import { ORDER_PHASES } from '#database/schemas/enumerated_values';

// TODO: NEED TO BE FINISHED
export const ordersRoute = createRouter()
	.get(`${authPath}/status/:status`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { status } = c.req.param();

		const { db } = createClient();

		const cityAlias = alias(cities, 'city');
		const provinceAlias = alias(cities, 'province');

		let userOrders = [];

		// if status is all or undefined, get all orders
		if (status === 'all' || !status) {
			userOrders = await db
				.select()
				.from(orders)
				.innerJoin(items, eq(orders.item_id, items.id))
				.innerJoin(profiles, eq(orders.seller_id, profiles.id))
				.innerJoin(users, eq(profiles.user_id, users.id))
				.innerJoin(addresses, eq(orders.buyer_address, addresses.id))
				.innerJoin(cityAlias, eq(addresses.city_id, cityAlias.id))
				.innerJoin(provinceAlias, eq(addresses.province_id, provinceAlias.id))
				.where(eq(orders.buyer_id, user.id));
		} else {
			const response = await db
				.select()
				.from(orders)
				.innerJoin(items, eq(orders.item_id, items.id))
				.innerJoin(profiles, eq(orders.seller_id, profiles.id))
				.innerJoin(users, eq(profiles.user_id, users.id))
				.innerJoin(addresses, eq(orders.buyer_address, addresses.id))
				.innerJoin(cityAlias, eq(addresses.city_id, cityAlias.id))
				.innerJoin(provinceAlias, eq(addresses.province_id, provinceAlias.id))
				.where(and(eq(orders.buyer_id, user.id), eq(orders.status, status)));

			if (!response.length) return c.json([], 200);

			userOrders = response;
		}

		if (!userOrders.length) return c.json([], 200);

		const orderList = userOrders.map((order) => {
			const id = order.orders.id;
			const { status, shipping_price, payment_provider_charge, platform_charge, shipping_label_id, created_at } =
				order.orders;

			return {
				id,
				status: status as (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES],
				original_price: order.items.price,
				payment_provider_charge,
				platform_charge,
				shipping_price,
				shipping_label_id,
				item: {
					id: order.items.id,
					title: order.items.title,
				},
				seller: {
					id: order.users.id,
					username: order.users.username,
				},
				buyer: {
					street_address: order.addresses.street_address,
					civic_number: order.addresses.civic_number,
					city: order.city.name,
					province: order.province.name,
					postal_code: order.addresses.postal_code,
					country_code: order.addresses.country_code,
				},
				updated_at: order.orders.updated_at,
				created_at,
			};
		});

		return c.json(orderList, 200);
	})
	.get(`${authPath}/:id`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { id } = c.req.param();

		const [order] = await db
			.select()
			.from(orders)
			.where(eq(orders.id, Number(id)));

		if (!order) return c.json({ error: 'Order not found' }, 404);

		return c.json(order);
	});
