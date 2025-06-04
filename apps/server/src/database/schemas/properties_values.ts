import { relations, sql } from 'drizzle-orm';
import { pgTable, integer, text, index, boolean } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { properties } from './properties';

export const property_values = pgTable(
	'property_values',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		property_id: integer('property_id')
			.notNull()
			.references(() => properties.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		// Constraint Reminder: value & boolean_value can't both co-exist, only one is allowed.
		value: text('value'),
		boolean_value: boolean('boolean_value'),
		numeric_value: integer('numeric_value'),
		icon: text('icon'),
		meta: text('meta'),
	},
	(table) => [
		index('value_id_idx').on(table.value),
		// Constraint Reminder: value & boolean_value can't both co-exist, only one is allowed.
		sql`CHECK (
      (value IS NOT NULL AND boolean_value IS NULL) OR 
      (value IS NULL AND boolean_value IS NOT NULL)
    )`,
	],
);

export const property_valuesRelations = relations(property_values, ({ one }) => ({
	property: one(properties, {
		fields: [property_values.property_id],
		references: [properties.id],
	}),
}));

export type SelectPropertyValue = typeof property_values.$inferSelect;
export type InsertPropertyValue = typeof property_values.$inferInsert;

export const selectPropertyValuesSchema = createSelectSchema(property_values);

export const insertPropertyValuesSchema = createInsertSchema(property_values);

export const patchPropertyValuesSchema = insertPropertyValuesSchema.partial();
