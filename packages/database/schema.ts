import { pgTable, integer, varchar, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const refreshTokens = pgTable('refresh_tokens', {
	id: uuid('id')
		.default(sql`gen_random_uuid()`)
		.primaryKey(),
	email: text('email').notNull(),
	token: text('token').notNull().unique(),
	expiresAt: timestamp('expires_at').notNull(),
});

// Define the 'users' table
export const users = pgTable('users', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	firstName: varchar('firstname', { length: 255 }).notNull(),
	lastName: varchar('lastname', { length: 255 }).notNull(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	password: varchar('password', { length: 255 }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Define the relations for the 'users' table
export const usersRelations = relations(users, ({ many }) => ({
	items: many(items),
}));

// Define the 'items' table
export const items = pgTable(
	'items',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		title: text('title').notNull(),
		content: text('content').notNull(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		draft: boolean('draft').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [table.userId],
);

// Define the relations for the 'items' table
export const itemsRelations = relations(items, ({ one }) => ({
	author: one(users, {
		fields: [items.userId],
		references: [users.id],
	}),
}));
