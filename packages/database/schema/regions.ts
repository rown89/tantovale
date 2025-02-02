import { relations } from 'drizzle-orm';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { provinces } from './provinces';
import { municipalities } from './municipalities';

export const regions = pgTable('regions', {
	id: serial('id').primaryKey().notNull(),
	region_code: text('region_code').unique().notNull(),
	region_name: text('region_name').notNull(),
});

export const regionsRelations = relations(regions, ({ many }) => ({
	provinces: many(provinces),
	municipalities: many(municipalities),
}));
