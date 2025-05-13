import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { pgTable, integer, boolean, uniqueIndex, timestamp } from 'drizzle-orm/pg-core';

import { properties } from './properties';
import { subcategories } from './subcategories';
import { relations } from 'drizzle-orm';

export const subcategory_properties = pgTable(
	'subcategory_properties',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		property_id: integer('property_id')
			.notNull()
			.references(() => properties.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			}),
		subcategory_id: integer('subcategory_id')
			.notNull()
			.references(() => subcategories.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			}),
		position: integer('position').notNull().default(0),
		on_item_create_required: boolean('on_item_create_required').default(false).notNull(),
		on_item_update_editable: boolean('on_item_update_editable').default(true).notNull(),
		is_searchable: boolean('is_searchable').default(true).notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		// Add a unique constraint to ensure property_id is unique within each subcategory_id
		uniqueIndex('unique_property_per_subcategory').on(table.property_id, table.subcategory_id),
	],
);

export const subcategory_propertiesRelations = relations(subcategory_properties, ({ one }) => ({
	property: one(properties, {
		fields: [subcategory_properties.property_id],
		references: [properties.id],
	}),
	subcategory: one(subcategories, {
		fields: [subcategory_properties.subcategory_id],
		references: [subcategories.id],
	}),
}));

export type SelectSubcategoryProperty = typeof subcategory_properties.$inferSelect;
export type InsertSubcategoryProperty = typeof subcategory_properties.$inferInsert;

export const selectSubcategoriesPropertiesSchema = createSelectSchema(subcategory_properties);

export const insertSubcategoriesPropertiesSchema = createInsertSchema(subcategory_properties);

export const patchSubcategoriesPropertiesSchema = insertSubcategoriesPropertiesSchema.partial();
