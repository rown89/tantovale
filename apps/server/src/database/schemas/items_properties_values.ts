import { pgTable, integer } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod';

import { items } from './items';
import { property_values } from './properties_values';

export const items_properties_values = pgTable('items_properties_values', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	item_id: integer('item_id')
		.notNull()
		.references(() => items.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
	property_value_id: integer('property_value_id')
		.notNull()
		.references(() => property_values.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
});

export type SelectItemPropertyValue = typeof items_properties_values.$inferSelect;
export type InsertItemPropertyValue = typeof items_properties_values.$inferInsert;

export const selectItemPropertiesValuesSchema = createSelectSchema(items_properties_values);

export const insertItemPropertiesValuesSchema = createInsertSchema(items_properties_values);

export const patchItemPropertiesValuesSchema = insertItemPropertiesValuesSchema.partial();
