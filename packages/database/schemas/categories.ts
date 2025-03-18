import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subcategories } from './subcategories';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { categoriesEnum } from './enumerated_types';

export const categories = pgTable('categories', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	slug: categoriesEnum('slug').notNull().unique(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
	subcategories: many(subcategories),
}));

export type SelectCategory = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export const selectCategoriesSchema = createSelectSchema(categories);

export const insertCategoriesSchema = createInsertSchema(categories);

export const patchCategoriessSchema = insertCategoriesSchema.partial();
