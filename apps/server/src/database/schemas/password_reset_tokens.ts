import { pgTable, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

import { users } from './users';

export const password_reset_tokens = pgTable('password_reset_tokens', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	user_id: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	token: text('token').notNull(),
	expires_at: timestamp('expires_at').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
	resetTokens: many(password_reset_tokens),
}));

export type SelectPasswordResetToken = typeof password_reset_tokens.$inferSelect;
export type InsertPasswordResetToken = typeof password_reset_tokens.$inferInsert;

export const selectPasswordResetTokensSchema = createSelectSchema(password_reset_tokens);

export const insertPasswordResetTokensSchema = createInsertSchema(password_reset_tokens);

export const patchPasswordResetTokensSchema = insertPasswordResetTokensSchema.partial();
