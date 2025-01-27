import { pgTable, integer, varchar, text, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users_ = pgTable('users', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	firstname: varchar({ length: 255 }).notNull(),
	lastname: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull().unique(),
	password: varchar({ length: 255 }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations_ = relations(users_, ({ many }) => ({
	articles: many(articles_),
}));

export const articles_ = pgTable(
	'articles',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		title: text('title').notNull(),
		content: text('content').notNull(),
		userId: integer('user_id')
			.notNull()
			.references(() => users_.id),
		draft: boolean('draft').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(articles) => {
		return {
			articleIndex: index('name_index').on(articles.id),
		};
	},
);

export const articlesRelations_ = relations(articles_, ({ one }) => ({
	takeout: one(users_, {
		fields: [articles_.userId],
		references: [users_.id],
	}),
}));
