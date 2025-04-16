import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { sql } from 'drizzle-orm';

import { users } from './users';

export const refreshTokens = pgTable('refresh_tokens', {
	id: uuid('id')
		.default(sql`gen_random_uuid()`)
		.primaryKey(),
	username: text('username')
		.references(() => users.username, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		})
		.notNull(),
	token: text('token').notNull().unique(),
	expires_at: timestamp('expires_at').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectRefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = typeof refreshTokens.$inferInsert;

export const selectRefreshTokensSchema = createSelectSchema(refreshTokens);

export const insertRefreshTokensSchema = createInsertSchema(refreshTokens);

export const patchRefreshTokensSchema = insertRefreshTokensSchema.partial();
