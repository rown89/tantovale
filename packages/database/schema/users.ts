import { pgTable, integer, varchar, timestamp, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { items } from './items';
import { sexEnum } from './enumerated_types';

export const users = pgTable('users', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity().notNull(),
	name: varchar('name', { length: 255 }).notNull(),
	birthday: date('birthday').notNull(),
	sex: sexEnum('sex').notNull(),
	email: varchar('email', { length: 255 }).unique().notNull(),
	password: varchar('password', { length: 255 }).notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
	items: many(items),
}));
