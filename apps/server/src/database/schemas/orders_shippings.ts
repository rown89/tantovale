import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { orders } from './orders';
import { relations } from 'drizzle-orm';
import { shippings } from './shippings';

export const orders_shippings = pgTable('orders_shippings', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	order_id: integer('order_id').references(() => orders.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	shipping_id: integer('shipping_id').references(() => shippings.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const orders_shippingsRelations = relations(orders_shippings, ({ one }) => ({
	order: one(orders, {
		fields: [orders_shippings.order_id],
		references: [orders.id],
	}),
	shipping: one(shippings, {
		fields: [orders_shippings.shipping_id],
		references: [shippings.id],
	}),
}));

export const orders_shippingsSelectSchema = createSelectSchema(orders_shippings);
export const orders_shippingsInsertSchema = createInsertSchema(orders_shippings);
