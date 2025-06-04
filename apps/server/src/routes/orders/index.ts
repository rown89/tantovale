import { and, eq } from 'drizzle-orm';

import { createClient } from 'src/database';
import { createRouter } from 'src/lib/create-app';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { orders } from 'src/database/schemas/orders';
import { orders_items } from 'src/database/schemas/orders_items';
import { property_values } from 'src/database/schemas/properties_values';
import { items_properties_values } from 'src/database/schemas/items_properties_values';
import { items } from 'src/database/schemas/items';
import { users } from 'src/database/schemas/users';
import { authPath } from 'src/utils/constants';

// TODO: NEED TO BE FINISHED
export const ordersRoute = createRouter()
	.get(`${authPath}/status/:status`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { status } = c.req.param();

		const { db } = createClient();

		let userOrders = [];

		// if status is all or undefined, get all orders
		if (status === 'all' || !status) {
			userOrders = await db
				.select()
				.from(orders)
				.innerJoin(orders_items, eq(orders.id, orders_items.order_id))
				.innerJoin(items, eq(orders_items.item_id, items.id))
				.innerJoin(users, eq(orders.seller_id, users.id))
				.where(eq(orders.buyer_id, user.id));
		} else {
			userOrders = await db
				.select()
				.from(orders)
				.innerJoin(orders_items, eq(orders.id, orders_items.order_id))
				.innerJoin(items, eq(orders_items.item_id, items.id))
				.innerJoin(users, eq(orders.seller_id, users.id))
				.where(and(eq(orders.buyer_id, user.id), eq(orders_items.order_status, status)));
		}

		if (!userOrders.length) return c.json([], 200);

		const orderList = userOrders.map((order) => {
			const id = order.orders.id;
			const { order_status, finished_price, created_at } = order.orders_items;

			return {
				id,
				order_status,
				original_price: order.items.price,
				finished_price,
				created_at,
				item: {
					id: order.items.id,
					title: order.items.title,
				},
				seller: {
					id: order.users.id,
					username: order.users.username,
				},
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
	})
	.post(`${authPath}/payment/:id`, authMiddleware, async (c) => {
		const { db } = createClient();

		const { id, delivery_method } = c.req.param();

		const [orderItem] = await db
			.select()
			.from(orders_items)
			.where(eq(orders_items.id, Number(id)));

		if (!orderItem) return c.json({ error: 'Order item not found' }, 404);
		if (!orderItem.item_id) return c.json({ error: 'Order item has no item' }, 404);

		if (delivery_method === 'shipping') {
			// get the "shipping" property value id
			const [itemPropertyValue] = await db
				.select({
					id: property_values.id,
				})
				.from(property_values)
				.where(and(eq(property_values.value, 'shipping')))
				.limit(1);

			if (!itemPropertyValue) throw new Error('Item property value "shipping" not found');

			// Check if the item has a "shipping" property value
			const [itemShippingPropertyValue] = await db
				.select({
					property_value: items_properties_values.property_value_id,
				})
				.from(items_properties_values)
				.where(
					and(
						eq(items_properties_values.item_id, orderItem.item_id),
						eq(items_properties_values.property_value_id, itemPropertyValue.id),
					),
				)
				.limit(1);

			if (itemShippingPropertyValue) {
				// TODO :create a new shipping with the shipping provider
			}

			// return c.json(order);
		} else {
			// return c.json(order);
		}
	});
