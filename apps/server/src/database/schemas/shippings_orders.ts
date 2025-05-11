import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { orders } from './orders';
import { shippings } from './shippings';

export const shippings_orders = pgTable('shippings_orders', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	shipping_id: integer('shipping_id').references(() => shippings.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	order_id: integer('order_id').references(() => orders.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const shippings_ordersSelectSchema = createSelectSchema(shippings_orders);
export const shippings_ordersInsertSchema = createInsertSchema(shippings_orders);
