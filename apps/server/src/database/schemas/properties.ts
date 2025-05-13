import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { propertiesEnum, propertyTypeEnum } from './enumerated_types';

export const properties = pgTable('properties', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	slug: propertiesEnum('slug').notNull().unique(),
	type: propertyTypeEnum('type').notNull(),
});

export type SelectProperty = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

export const selectPropertySchema = createSelectSchema(properties);

export const insertPropertySchema = createInsertSchema(properties);

export const patchPropertySchema = insertPropertySchema.partial();
