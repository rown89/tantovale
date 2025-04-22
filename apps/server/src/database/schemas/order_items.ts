import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { orders } from './orders';
import { items } from './items';

export const order_items = pgTable('order_items', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	order_id: integer('order_id').references(() => orders.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	item_id: integer('item_id').references(() => items.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	quantity: integer('quantity').notNull().default(1),
	shipping_cost: integer('shipping_cost').notNull(),
	price: integer('price').notNull(),
	total_price: integer('total_price').notNull(),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const order_itemsRelations = relations(order_items, ({ one }) => ({
	order: one(orders, {
		fields: [order_items.order_id],
		references: [orders.id],
	}),
	item: one(items, {
		fields: [order_items.item_id],
		references: [items.id],
	}),
}));

export const order_itemsSelectSchema = createSelectSchema(order_items);
export const order_itemsInsertSchema = createInsertSchema(order_items);
