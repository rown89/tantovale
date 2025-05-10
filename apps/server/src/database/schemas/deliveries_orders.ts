import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { orders } from './orders';
import { relations } from 'drizzle-orm';
import { deliveries } from './deliveries';

export const deliveries_orders = pgTable('deliveries_orders', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	order_id: integer('order_id').references(() => orders.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	delivery_id: integer('delivery_id').references(() => deliveries.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const deliveries_ordersRelations = relations(deliveries_orders, ({ one }) => ({
	order: one(orders, {
		fields: [deliveries_orders.order_id],
		references: [orders.id],
	}),
	delivery: one(deliveries, {
		fields: [deliveries_orders.delivery_id],
		references: [deliveries.id],
	}),
}));

export const deliveries_ordersSelectSchema = createSelectSchema(deliveries_orders);
export const deliveries_ordersInsertSchema = createInsertSchema(deliveries_orders);
