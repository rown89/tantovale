import { pgTable, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { users } from './users';
import { relations } from 'drizzle-orm';

export const passwordResetTokens = pgTable('password_reset_tokens', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	token: text('token').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
	resetTokens: many(passwordResetTokens),
}));
