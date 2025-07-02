import { pgTable, integer, timestamp, foreignKey, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

import { profiles } from './profiles';
import { addresses } from './addresses';
import { items } from './items';
import { ORDER_PHASES } from './enumerated_values';

export const orders = pgTable(
	'orders',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		item_id: integer('item_id').references(() => items.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		payment_provider_charge: integer('payment_provider_charge').notNull(),
		platform_charge: integer('platform_charge').notNull(),
		shipping_price: integer('shipping_price').notNull(),
		buyer_id: integer('buyer_id').references(() => profiles.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		seller_id: integer('seller_id').references(() => profiles.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		buyer_address: integer('buyer_address').references(() => addresses.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		seller_address: integer('seller_address').references(() => addresses.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		payment_transaction_id: integer('payment_transaction_id'),
		status: text('status').notNull().default(ORDER_PHASES.PAYMENT_PENDING),
		created_at: timestamp('created_at').notNull().defaultNow(),
		updated_at: timestamp('updated_at').notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			columns: [table.buyer_id],
			foreignColumns: [profiles.id],
			name: 'orders_buyer_id_fkey',
		}),
		foreignKey({
			columns: [table.seller_id],
			foreignColumns: [profiles.id],
			name: 'orders_seller_id_fkey',
		}),
		foreignKey({
			columns: [table.buyer_address],
			foreignColumns: [addresses.id],
			name: 'orders_buyer_address_fkey',
		}),
		foreignKey({
			columns: [table.seller_address],
			foreignColumns: [addresses.id],
			name: 'orders_seller_address_fkey',
		}),
	],
);

export const ordersRelations = relations(orders, ({ one }) => ({
	buyer: one(profiles, {
		fields: [orders.buyer_id],
		references: [profiles.id],
	}),
	seller: one(profiles, {
		fields: [orders.seller_id],
		references: [profiles.id],
	}),
}));

export type SelectOrder = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export const ordersSelectSchema = createSelectSchema(orders);
export const ordersInsertSchema = createInsertSchema(orders);
