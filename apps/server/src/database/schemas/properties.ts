import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

export const properties = pgTable('properties', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	type: text('type').notNull(),
});

export type SelectProperty = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

export const selectPropertySchema = createSelectSchema(properties);

export const insertPropertySchema = createInsertSchema(properties);

export const patchPropertySchema = insertPropertySchema.partial();
