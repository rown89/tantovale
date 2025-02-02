import { pgTable, integer, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subcategories } from './subcategories';

export const categories = pgTable('categories', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	description: text('description'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
	subcategories: many(subcategories),
}));
