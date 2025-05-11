import { and, eq } from 'drizzle-orm';

import { createClient } from 'src/database';
import { createRouter } from 'src/lib/create-app';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { orders } from 'src/database/schemas/orders';
import { orders_items } from 'src/database/schemas/orders_items';
import { filterValues } from 'src/database/schemas/filter_values';
import { itemsFiltersValues } from 'src/database/schemas/items_filter_values';

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
			// get the "shipping" filter value id
			const [itemFilterValue] = await db
				.select({
					id: filterValues.id,
				})
				.from(filterValues)
				.where(and(eq(filterValues.value, 'shipping')))
				.limit(1);

			if (!itemFilterValue) throw new Error('Item filter value "shipping" not found');

			// Check if the item has a "shipping" filter value
			const [itemShippingFilterValue] = await db
				.select({
					filter_value: itemsFiltersValues.filter_value_id,
				})
				.from(itemsFiltersValues)
				.where(
					and(
						eq(itemsFiltersValues.item_id, orderItem.item_id),
						eq(itemsFiltersValues.filter_value_id, itemFilterValue.id),
					),
				)
				.limit(1);

			if (itemShippingFilterValue) {
				// TODO :create a new shipping with the shipping provider
			}

			// return c.json(order);
		} else {
			// return c.json(order);
		}
	});
