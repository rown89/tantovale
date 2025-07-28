import { pgTable, integer, timestamp, foreignKey, text, index } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

import { profiles } from './profiles';
import { addresses } from './addresses';
import { items } from './items';
import { ORDER_PHASES } from './enumerated_values';
import { orders_proposals } from './orders_proposals';

export const orders = pgTable(
	'orders',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		item_id: integer('item_id')
			.references(() => items.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			})
			.notNull(),
		proposal_id: integer('proposal_id').references(() => orders_proposals.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		status: text('status').notNull().default(ORDER_PHASES.PAYMENT_PENDING),
		buyer_id: integer('buyer_id')
			.references(() => profiles.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			})
			.notNull(),
		seller_id: integer('seller_id')
			.references(() => profiles.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			})
			.notNull(),
		buyer_address: integer('buyer_address')
			.references(() => addresses.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			})
			.notNull(),
		seller_address: integer('seller_address')
			.references(() => addresses.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			})
			.notNull(),
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
		index('orders_status_idx').on(table.status),
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
