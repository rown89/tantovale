import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { categories } from './categories';
import { items } from './items';

export const subcategories = pgTable('subcategories', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	description: text('description'),
	categoryId: integer('category_id')
		.notNull()
		.references(() => categories.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subcategoriesRelations = relations(subcategories, ({ one, many }) => ({
	category: one(categories, {
		fields: [subcategories.categoryId],
		references: [categories.id],
	}),
	items: many(items),
}));
