import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { provinces } from './provinces';
import { regions } from './regions';
import { relations } from 'drizzle-orm';

export const municipalities = pgTable('municipalities', {
	id: serial('id').primaryKey().notNull(),
	municipality_name: text('municipality_name').notNull(),
	cap: text('cap').notNull(),
	province_code: text('province_code')
		.notNull()
		.references(() => provinces.province_code),
	region_code: text('region_code')
		.notNull()
		.references(() => regions.region_code),
	flag_capital: text('flag_capital').notNull(),
});

export const municipalitiesRelations = relations(municipalities, ({ one }) => ({
	province: one(provinces),
	region: one(regions),
}));
