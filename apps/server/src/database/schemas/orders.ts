import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

import { orderStatusEnum } from './enumerated_types';
import { users } from './users';

export const orders = pgTable('orders', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	buyer_id: integer('buyer_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	seller_id: integer('seller_id').references(() => users.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const ordersRelations = relations(orders, ({ one }) => ({
	buyer: one(users, {
		fields: [orders.buyer_id],
		references: [users.id],
	}),
	seller: one(users, {
		fields: [orders.seller_id],
		references: [users.id],
	}),
}));

export const ordersSelectSchema = createSelectSchema(orders);
export const ordersInsertSchema = createInsertSchema(orders);
