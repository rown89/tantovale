import { pgTable, text, varchar, json, integer } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod';

import { regions } from './regions';

export const subRegions = pgTable('sub_regions', {
	id: integer('id').primaryKey().notNull(),
	name: text('name').notNull(),
	region_id: integer('region_id')
		.notNull()
		.references(() => regions.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
	translations: json('translations').notNull(),
	wikiDataId: varchar('wiki_data_id', { length: 100 }).notNull(),
});

export type SelectSubRegion = typeof subRegions.$inferSelect;
export type InsertSubRegion = typeof subRegions.$inferInsert;

export const selectSubRegionsSchema = createSelectSchema(subRegions);

export const insertSubRegionsSchema = createInsertSchema(subRegions);

export const patchSubRegionsSchema = insertSubRegionsSchema.partial();
