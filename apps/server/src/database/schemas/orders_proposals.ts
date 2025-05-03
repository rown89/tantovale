import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { users } from './users';
import { items } from './items';
import { ordersProposalStatusEnum } from './enumerated_types';

export const ordersProposals = pgTable('orders_proposals', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	item_id: integer('item_id').references(() => items.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	user_id: integer('user_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	price: integer('price').notNull(),
	status: ordersProposalStatusEnum('status').notNull().default('pending'),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const ordersProposalsRelations = relations(ordersProposals, ({ one }) => ({
	item: one(items, {
		fields: [ordersProposals.item_id],
		references: [items.id],
	}),
	user: one(users, {
		fields: [ordersProposals.user_id],
		references: [users.id],
	}),
}));

export const ordersProposalsSelectSchema = createSelectSchema(ordersProposals);
export const ordersProposalsInsertSchema = createInsertSchema(ordersProposals);
