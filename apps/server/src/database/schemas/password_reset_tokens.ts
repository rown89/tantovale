import { pgTable, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

import { users } from './users';

export const passwordResetTokens = pgTable('password_reset_tokens', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	token: text('token').notNull(),
	expires_at: timestamp('expires_at').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
	resetTokens: many(passwordResetTokens),
}));

export type SelectPasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export const selectPasswordResetTokensSchema = createSelectSchema(passwordResetTokens);

export const insertPasswordResetTokensSchema = createInsertSchema(passwordResetTokens);

export const patchPasswordResetTokensSchema = insertPasswordResetTokensSchema.partial();
