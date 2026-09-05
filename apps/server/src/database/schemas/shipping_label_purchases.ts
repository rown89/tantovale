import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod';

import { items } from './items';
import { orders } from './orders';

export const SHIPPING_LABEL_PURCHASE_STATES = {
	CREATING: 'creating',
	RECONCILIATION_REQUIRED: 'reconciliation_required',
	PURCHASED: 'purchased',
} as const;

export const SHIPPING_LABEL_REFUND_STATES = {
	NONE: 'none',
	REQUESTING: 'requesting',
	RECONCILIATION_REQUIRED: 'reconciliation_required',
	PENDING: 'pending',
	REFUNDED: 'refunded',
	REJECTED: 'rejected',
} as const;

export const shipping_label_purchases = pgTable(
	'shipping_label_purchases',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		order_id: integer('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
		item_id: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
		purchase_attempt_id: uuid('purchase_attempt_id').notNull(),
		shippo_rate_id: text('shippo_rate_id').notNull(),
		state: text('state').notNull().default(SHIPPING_LABEL_PURCHASE_STATES.CREATING),
		provider_transaction_id: text('provider_transaction_id'),
		label_url: text('label_url'),
		provider_status: text('provider_status'),
		tracking_number: text('tracking_number'),
		tracking_url: text('tracking_url'),
		refund_state: text('refund_state').notNull().default(SHIPPING_LABEL_REFUND_STATES.NONE),
		refund_attempt_id: uuid('refund_attempt_id'),
		provider_refund_id: text('provider_refund_id'),
		provider_refund_status: text('provider_refund_status'),
		refund_requested_at: timestamp('refund_requested_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('shipping_label_purchases_order_id_idx').on(table.order_id),
		uniqueIndex('shipping_label_purchases_attempt_id_idx').on(table.purchase_attempt_id),
		uniqueIndex('shipping_label_purchases_provider_transaction_id_idx')
			.on(table.provider_transaction_id)
			.where(sql`${table.provider_transaction_id} IS NOT NULL`),
		uniqueIndex('shipping_label_purchases_refund_attempt_id_idx')
			.on(table.refund_attempt_id)
			.where(sql`${table.refund_attempt_id} IS NOT NULL`),
		uniqueIndex('shipping_label_purchases_provider_refund_id_idx')
			.on(table.provider_refund_id)
			.where(sql`${table.provider_refund_id} IS NOT NULL`),
		index('shipping_label_purchases_state_idx').on(table.state),
		index('shipping_label_purchases_refund_state_idx').on(table.refund_state),
		check(
			'shipping_label_purchases_state_check',
			sql`${table.state} IN ('creating', 'reconciliation_required', 'purchased')`,
		),
		check(
			'shipping_label_purchases_purchased_graph_check',
			sql`${table.state} <> 'purchased' OR (
				${table.provider_transaction_id} IS NOT NULL
				AND ${table.label_url} IS NOT NULL
				AND ${table.provider_status} IS NOT NULL
				AND ${table.provider_status} = 'SUCCESS'
			)`,
		),
		check(
			'shipping_label_purchases_provider_evidence_check',
			sql`(
				${table.provider_transaction_id} IS NULL
				AND ${table.label_url} IS NULL
				AND ${table.provider_status} IS NULL
				AND ${table.tracking_number} IS NULL
				AND ${table.tracking_url} IS NULL
			) OR (
				${table.provider_transaction_id} IS NOT NULL
				AND ${table.label_url} IS NOT NULL
				AND ${table.provider_status} IS NOT NULL
				AND ${table.provider_status} = 'SUCCESS'
			)`,
		),
		check(
			'shipping_label_purchases_refund_state_check',
			sql`${table.refund_state} IN ('none', 'requesting', 'reconciliation_required', 'pending', 'refunded', 'rejected')`,
		),
		check(
			'shipping_label_purchases_refund_requires_purchase_check',
			sql`${table.refund_state} = 'none' OR ${table.state} = 'purchased'`,
		),
		check(
			'shipping_label_purchases_refund_provider_status_check',
			sql`${table.provider_refund_status} IS NULL OR ${table.provider_refund_status} IN ('QUEUED', 'PENDING', 'SUCCESS', 'ERROR')`,
		),
		check(
			'shipping_label_purchases_refund_graph_check',
			sql`(
				${table.refund_state} = 'none'
				AND ${table.refund_attempt_id} IS NULL
				AND ${table.provider_refund_id} IS NULL
				AND ${table.provider_refund_status} IS NULL
				AND ${table.refund_requested_at} IS NULL
			) OR (
				${table.refund_state} = 'requesting'
				AND ${table.refund_attempt_id} IS NOT NULL
				AND ${table.provider_refund_id} IS NULL
				AND ${table.provider_refund_status} IS NULL
				AND ${table.refund_requested_at} IS NOT NULL
			) OR (
				${table.refund_state} = 'reconciliation_required'
				AND ${table.refund_attempt_id} IS NOT NULL
				AND ${table.refund_requested_at} IS NOT NULL
				AND (
					(${table.provider_refund_id} IS NULL AND ${table.provider_refund_status} IS NULL)
					OR (${table.provider_refund_id} IS NOT NULL AND ${table.provider_refund_status} IS NOT NULL)
				)
			) OR (
				${table.refund_state} = 'pending'
				AND ${table.refund_attempt_id} IS NOT NULL
				AND ${table.provider_refund_id} IS NOT NULL
				AND ${table.provider_refund_status} IN ('QUEUED', 'PENDING')
				AND ${table.refund_requested_at} IS NOT NULL
			) OR (
				${table.refund_state} = 'refunded'
				AND ${table.refund_attempt_id} IS NOT NULL
				AND ${table.provider_refund_id} IS NOT NULL
				AND ${table.provider_refund_status} = 'SUCCESS'
				AND ${table.refund_requested_at} IS NOT NULL
			) OR (
				${table.refund_state} = 'rejected'
				AND ${table.refund_attempt_id} IS NOT NULL
				AND ${table.provider_refund_id} IS NOT NULL
				AND ${table.provider_refund_status} = 'ERROR'
				AND ${table.refund_requested_at} IS NOT NULL
			)`,
		),
	],
);

export type SelectShippingLabelPurchase = typeof shipping_label_purchases.$inferSelect;
export type InsertShippingLabelPurchase = typeof shipping_label_purchases.$inferInsert;

export const shippingLabelPurchasesSelectSchema = createSelectSchema(shipping_label_purchases);
export const shippingLabelPurchasesInsertSchema = createInsertSchema(shipping_label_purchases);
