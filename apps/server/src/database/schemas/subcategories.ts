import { pgTable, integer, text, timestamp, type AnyPgColumn, boolean } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { categories } from './categories';
import { items } from './items';

export const subcategories = pgTable('subcategories', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	category_id: integer('category_id')
		.notNull()
		.references(() => categories.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
	parent_id: integer('parent_id')
		.references((): AnyPgColumn => subcategories.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		})
		.default(sql.raw('NULL')),
	easy_pay: boolean('easy_pay'),
	menu_order: integer('menu_order').notNull().default(0),
	published: boolean('published').notNull().default(true),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subcategoriesRelations = relations(subcategories, ({ one, many }) => ({
	category: one(categories, {
		fields: [subcategories.category_id],
		references: [categories.id],
	}),
	items: many(items),
	parent: one(subcategories, {
		fields: [subcategories.parent_id],
		references: [subcategories.id],
	}),
}));

export type SelectSubCategories = typeof subcategories.$inferSelect;
export type InsertSubCategories = typeof subcategories.$inferInsert;

export const selectSubcategoriesSchema = createSelectSchema(subcategories);

export const insertSubcategoriesSchema = createInsertSchema(subcategories);

export const patchSubcategoriesSchema = insertSubcategoriesSchema.partial();
