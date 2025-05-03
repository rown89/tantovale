import { pgTable, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { currencyEnum, transactionsStatusEnum } from './enumerated_types';

import { users } from './users';

export const transactions = pgTable('transactions', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	seller_id: integer('seller_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	buyer_id: integer('buyer_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	stripePaymentIntentId: text('stripe_payment_intent_id'),
	amount: integer('price').notNull(),
	currency: currencyEnum('currency').notNull().default('eur'),
	payment_status: transactionsStatusEnum('payment_status'),
	released_at: timestamp('released_at'),
	created_at: timestamp('created_at').notNull().defaultNow(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
	seller: one(users, {
		fields: [transactions.seller_id],
		references: [users.id],
	}),
	buyer: one(users, {
		fields: [transactions.buyer_id],
		references: [users.id],
	}),
}));

export const transactionsSelectSchema = createSelectSchema(transactions);
export const transactionsInsertSchema = createInsertSchema(transactions);
