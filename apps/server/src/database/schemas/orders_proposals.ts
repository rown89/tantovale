import { pgTable, integer, timestamp, foreignKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { items } from './items';
import { ordersProposalStatusEnum } from './enumerated_types';
import { profiles } from './profiles';

export const orders_proposals = pgTable(
	'orders_proposals',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		item_id: integer('item_id').references(() => items.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		profile_id: integer('profile_id').references(() => profiles.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		proposal_price: integer('proposal_price').notNull(),
		status: ordersProposalStatusEnum('status').notNull().default('pending'),
		created_at: timestamp('created_at').notNull().defaultNow(),
		updated_at: timestamp('updated_at').notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			columns: [table.item_id],
			foreignColumns: [items.id],
			name: 'orders_proposals_item_id_fkey',
		}),
		foreignKey({
			columns: [table.profile_id],
			foreignColumns: [profiles.id],
			name: 'orders_proposals_profile_id_fkey',
		}),
	],
);

export const orders_proposalsRelations = relations(orders_proposals, ({ one }) => ({
	item: one(items, {
		fields: [orders_proposals.item_id],
		references: [items.id],
	}),
	profile: one(profiles, {
		fields: [orders_proposals.profile_id],
		references: [profiles.id],
	}),
}));

export type SelectOrderProposal = typeof orders_proposals.$inferSelect;
export type InsertOrderProposal = typeof orders_proposals.$inferInsert;

export const ordersProposalsSelectSchema = createSelectSchema(orders_proposals);
export const ordersProposalsInsertSchema = createInsertSchema(orders_proposals);
