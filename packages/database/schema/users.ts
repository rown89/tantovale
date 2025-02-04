import { pgTable, integer, varchar, timestamp, boolean, date } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity().notNull(),
	email: varchar('email', { length: 255 }).unique().notNull(),
	password: varchar('password', { length: 255 }).notNull(),
	email_verified: boolean('email_verified').default(false).notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});
