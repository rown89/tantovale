import { pgTable, integer, timestamp, text, foreignKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { orders } from './orders';
import { items } from './items';

export const orders_items = pgTable(
	'orders_items',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		order_id: integer('order_id').references(() => orders.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		item_id: integer('item_id').references(() => items.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		finished_price: integer('finished_price').notNull(),
		order_status: text('order_status').notNull().default('payment_pending'),
		created_at: timestamp('created_at').notNull().defaultNow(),
		updated_at: timestamp('updated_at').notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			columns: [table.order_id],
			foreignColumns: [orders.id],
			name: 'orders_items_order_id_fkey',
		}),
		foreignKey({
			columns: [table.item_id],
			foreignColumns: [items.id],
			name: 'orders_items_item_id_fkey',
		}),
	],
);

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

export type SelectOrderItem = typeof orders_items.$inferSelect;
export type InsertOrderItem = typeof orders_items.$inferInsert;

export const orders_itemsSelectSchema = createSelectSchema(orders_items);
export const orders_itemsInsertSchema = createInsertSchema(orders_items);
