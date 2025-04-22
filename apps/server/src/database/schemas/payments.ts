import { pgTable, numeric, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { paymentCurrencyEnum, paymentStatusEnum } from './enumerated_types';

import { users } from './users';
import { items } from './items';

export const payments = pgTable('payments', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	item_id: integer('item_id').references(() => items.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	buyer_id: integer('buyer_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	amount: integer('price').notNull(),
	currency: paymentCurrencyEnum('currency').notNull().default('EUR'),
	payment_status: paymentStatusEnum('payment_status').notNull().default('pending'),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
	item: one(items, {
		fields: [payments.item_id],
		references: [items.id],
	}),
	buyer: one(users, {
		fields: [payments.buyer_id],
		references: [users.id],
	}),
}));

export const paymentsSelectSchema = createSelectSchema(payments);
export const paymentsInsertSchema = createInsertSchema(payments);
