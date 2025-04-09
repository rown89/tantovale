import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { filtersEnum, filterTypeEnum } from './enumerated_types';

export const filters = pgTable('filters', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	name: text('name').notNull(),
	slug: filtersEnum('slug').notNull().unique(),
	type: filterTypeEnum('type').notNull(),
});

export type SelectFilter = typeof filters.$inferSelect;
export type InsertFilter = typeof filters.$inferInsert;

export const selectFilterSchema = createSelectSchema(filters);

export const insertFilterSchema = createInsertSchema(filters);

export const patchFilterSchema = insertFilterSchema.partial();
