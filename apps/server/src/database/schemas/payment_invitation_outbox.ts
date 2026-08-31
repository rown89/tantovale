import { sql } from 'drizzle-orm';
import { bigint, check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod';

import { PAYMENT_INVITATION_STATES } from './enumerated_values';
import { orders } from './orders';

export const payment_invitation_outbox = pgTable(
	'payment_invitation_outbox',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		order_id: integer('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		transaction_id: bigint('transaction_id', { mode: 'string' }).notNull(),
		recipient_email: text('recipient_email').notNull(),
		merchant_username: text('merchant_username').notNull(),
		item_name: text('item_name').notNull(),
		state: text('state').notNull().default(PAYMENT_INVITATION_STATES.PENDING),
		attempt_count: integer('attempt_count').notNull().default(0),
		lease_token: uuid('lease_token'),
		lease_expires_at: timestamp('lease_expires_at', { withTimezone: true }),
		last_attempt_at: timestamp('last_attempt_at', { withTimezone: true }),
		sent_at: timestamp('sent_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('payment_invitation_outbox_order_idx').on(table.order_id),
		check('payment_invitation_outbox_state_check', sql`${table.state} IN ('pending', 'sending', 'sent')`),
		check('payment_invitation_outbox_attempt_count_check', sql`${table.attempt_count} >= 0`),
		check(
			'payment_invitation_outbox_lease_check',
			sql`(${table.state} = 'pending' AND ${table.lease_token} IS NULL AND ${table.lease_expires_at} IS NULL AND ${table.sent_at} IS NULL)
				OR (${table.state} = 'sending' AND ${table.lease_token} IS NOT NULL AND ${table.lease_expires_at} IS NOT NULL AND ${table.last_attempt_at} IS NOT NULL AND ${table.lease_expires_at} > ${table.last_attempt_at} AND ${table.sent_at} IS NULL)
				OR (${table.state} = 'sent' AND ${table.lease_token} IS NULL AND ${table.lease_expires_at} IS NULL AND ${table.sent_at} IS NOT NULL)`,
		),
	],
);

export type SelectPaymentInvitationOutbox = typeof payment_invitation_outbox.$inferSelect;
export type InsertPaymentInvitationOutbox = typeof payment_invitation_outbox.$inferInsert;

export const paymentInvitationOutboxSelectSchema = createSelectSchema(payment_invitation_outbox);
export const paymentInvitationOutboxInsertSchema = createInsertSchema(payment_invitation_outbox);
