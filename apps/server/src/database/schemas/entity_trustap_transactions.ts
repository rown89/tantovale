import { pgTable, integer, timestamp, text, boolean, varchar, foreignKey } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

import { orders } from './orders';

export const entityTrustapTransactions = pgTable(
	'entity_trustap_transactions',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		// Store order id as reference
		entityId: integer('order_id').references(() => orders.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		entityTitle: text('entity_title').notNull(),
		sellerId: text('seller_id'),
		buyerId: text('buyer_id'),
		transactionId: integer('transaction_id').notNull(),
		transactionType: varchar('transaction_type', { length: 255 }).notNull().default('online_payment'),
		status: text('status').notNull(),
		price: integer('price').notNull(),
		charge: integer('charge').notNull(),
		chargeSeller: integer('charge_seller').notNull(),
		currency: varchar('currency', { length: 10 }).notNull().default('eur'),
		claimedBySeller: boolean('claimed_by_seller').notNull().default(false),
		claimedByBuyer: boolean('claimed_by_buyer').notNull().default(false),
		complaintPeriodDeadline: timestamp('complaint_period_deadline'),
		created_at: timestamp('created_at').notNull().defaultNow(),
		updated_at: timestamp('updated_at').notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			columns: [table.entityId],
			foreignColumns: [orders.id],
			name: 'entity_trustap_transactions_entity_id_fkey',
		}),
	],
);

export const entityTrustapTransactionsRelations = relations(entityTrustapTransactions, ({ one }) => ({
	item: one(orders, {
		fields: [entityTrustapTransactions.entityId],
		references: [orders.id],
	}),
}));

export type SelectEntityTrustapTransaction = typeof entityTrustapTransactions.$inferSelect;
export type InsertEntityTrustapTransaction = typeof entityTrustapTransactions.$inferInsert;

export const entityTrustapTransactionsSelectSchema = createSelectSchema(entityTrustapTransactions);
export const entityTrustapTransactionsInsertSchema = createInsertSchema(entityTrustapTransactions);
