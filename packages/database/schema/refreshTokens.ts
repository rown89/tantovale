import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const refreshTokens = pgTable('refresh_tokens', {
	id: uuid('id')
		.default(sql`gen_random_uuid()`)
		.primaryKey(),
	email: text('email').notNull(),
	token: text('token').notNull().unique(),
	expiresAt: timestamp('expires_at').notNull(),
});
