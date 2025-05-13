import { and, eq } from 'drizzle-orm';

import { createClient } from 'src/database';
import { createRouter } from 'src/lib/create-app';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { orders } from 'src/database/schemas/orders';
import { orders_items } from 'src/database/schemas/orders_items';
import { property_values } from 'src/database/schemas/properties_values';
import { items_properties_values } from 'src/database/schemas/items_properties_values';

// TODO: NEED TO BE FINISHED
export const ordersRoute = createRouter()
	.get('/:id', authMiddleware, async (c) => {
		const { db } = createClient();

		const { id } = c.req.param();

		const [order] = await db
			.select()
			.from(orders)
			.where(eq(orders.id, Number(id)));

		if (!order) return c.json({ error: 'Order not found' }, 404);

		return c.json(order);
	})
	.post('/payment/:id', authMiddleware, async (c) => {
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
