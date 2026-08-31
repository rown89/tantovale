import { sql } from 'drizzle-orm';
import { check, pgTable, integer, timestamp, text, index, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod';

import { profiles } from './profiles';
import { addresses } from './addresses';
import { items } from './items';
import { ORDER_PHASES } from './enumerated_values';
import { PAYMENT_CREATION_STATES } from './enumerated_values';
import { orders_proposals } from './orders_proposals';
import { shipping_quotes } from './shipping_quotes';

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
		shipping_label_id: text('shipping_label_id').notNull(),
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
		legacy_payment_transaction_id: integer('legacy_payment_transaction_id'),
		payment_attempt_id: uuid('payment_attempt_id').unique(),
		payment_creation_state: text('payment_creation_state').notNull().default(PAYMENT_CREATION_STATES.CREATED),
		item_price: integer('item_price'),
		order_proposal_id: integer('order_proposal_id')
			.unique()
			.references(() => orders_proposals.id, {
				onDelete: 'restrict',
				onUpdate: 'cascade',
			}),
		shipping_quote_id: uuid('shipping_quote_id').references(() => shipping_quotes.id, {
			onDelete: 'restrict',
			onUpdate: 'cascade',
		}),
		status: text('status').notNull().default(ORDER_PHASES.PAYMENT_PENDING),
		created_at: timestamp('created_at').notNull().defaultNow(),
		updated_at: timestamp('updated_at').notNull().defaultNow(),
	},
	(table) => [
		check(
			'orders_payment_creation_state_check',
			sql`${table.payment_creation_state} IN ('preparing', 'creating', 'reconciliation_required', 'created')`,
		),
		index('orders_status_idx').on(table.status),
		uniqueIndex('orders_payment_transaction_id_idx')
			.on(table.payment_transaction_id)
			.where(sql`${table.payment_transaction_id} IS NOT NULL`),
		uniqueIndex('orders_active_item_idx')
			.on(table.item_id)
			.where(
				sql`${table.status} IN ('payment_pending', 'payment_confirmed', 'shipping_pending', 'shipping_confirmed', 'completed')`,
			),
	],
);

export type SelectOrder = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export const ordersSelectSchema = createSelectSchema(orders);
export const ordersInsertSchema = createInsertSchema(orders);
