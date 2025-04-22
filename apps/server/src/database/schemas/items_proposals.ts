import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { users } from './users';
import { items } from './items';
import { itemProposalStatusEnum } from './enumerated_types';

export const itemsProposals = pgTable('items_proposals', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	item_id: integer('item_id').references(() => items.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	user_id: integer('user_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	proposal_amount: integer('price').notNull(),
	proposal_status: itemProposalStatusEnum('proposal_status').notNull().default('pending'),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const itemsProposalsRelations = relations(itemsProposals, ({ one }) => ({
	item: one(items, {
		fields: [itemsProposals.item_id],
		references: [items.id],
	}),
	user: one(users, {
		fields: [itemsProposals.user_id],
		references: [users.id],
	}),
}));

export const itemsProposalsSelectSchema = createSelectSchema(itemsProposals);
export const itemsProposalsInsertSchema = createInsertSchema(itemsProposals);
