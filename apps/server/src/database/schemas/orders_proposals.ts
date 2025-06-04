import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { users } from './users';
import { items } from './items';
import { ordersProposalStatusEnum } from './enumerated_types';

export const orders_proposals = pgTable('orders_proposals', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	item_id: integer('item_id').references(() => items.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	user_id: integer('user_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	proposal_price: integer('proposal_price').notNull(),
	status: ordersProposalStatusEnum('status').notNull().default('pending'),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const orders_proposalsRelations = relations(orders_proposals, ({ one }) => ({
	item: one(items, {
		fields: [orders_proposals.item_id],
		references: [items.id],
	}),
	user: one(users, {
		fields: [orders_proposals.user_id],
		references: [users.id],
	}),
}));

export type SelectOrderProposal = typeof orders_proposals.$inferSelect;
export type InsertOrderProposal = typeof orders_proposals.$inferInsert;

export const orders_proposalsSelectSchema = createSelectSchema(orders_proposals);
export const orders_proposalsInsertSchema = createInsertSchema(orders_proposals);
