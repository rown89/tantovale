import { pgTable, integer, timestamp, foreignKey } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

import { profiles } from './profiles';

export const orders = pgTable(
	'orders',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		buyer_id: integer('buyer_id').references(() => profiles.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		seller_id: integer('seller_id').references(() => profiles.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
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
