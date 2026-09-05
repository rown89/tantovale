import { pgTable, varchar, json, integer } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod';

export const regions = pgTable('regions', {
	id: integer('id').primaryKey().notNull(),
	name: varchar('name', { length: 255 }).notNull(),
	translations: json('translations').notNull(),
	wikiDataId: varchar('wiki_data_id', { length: 255 }).notNull(),
});

export type SelectRegion = typeof regions.$inferSelect;
export type InsertRegion = typeof regions.$inferInsert;

export const selectRegionsSchema = createSelectSchema(regions);

export const insertRegionsSchema = createInsertSchema(regions);

export const patchRegionsSchema = insertRegionsSchema.partial();
