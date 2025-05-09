import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { orders } from './orders';
import { items } from './items';

export const orders_items = pgTable('orders_items', {
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
	price: integer('price').notNull(),
	total_price: integer('total_price').notNull(),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const orders_itemsRelations = relations(orders_items, ({ one }) => ({
	order: one(orders, {
		fields: [orders_items.order_id],
		references: [orders.id],
	}),
	item: one(items, {
		fields: [orders_items.item_id],
		references: [items.id],
	}),
}));

export const orders_itemsSelectSchema = createSelectSchema(orders_items);
export const orders_itemsInsertSchema = createInsertSchema(orders_items);
