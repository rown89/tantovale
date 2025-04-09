import { pgTable, integer, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

export const users = pgTable('users', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity().notNull(),
	username: varchar('username', { length: 50 }).unique().notNull(),
	email: varchar('email', { length: 255 }).unique().notNull(),
	phone: varchar('phone', { length: 30 }),
	password: varchar('password', { length: 255 }).notNull(),
	email_verified: boolean('email_verified').default(false).notNull(),
	phone_verified: boolean('phone_verified').default(false).notNull(),
	is_banned: boolean('is_banned').default(false).notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SelectUser = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const selectUsersSchema = createSelectSchema(users);

export const insertUsersSchema = createInsertSchema(users);

export const patchUsersSchema = insertUsersSchema.partial();
