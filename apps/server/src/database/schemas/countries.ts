import type { ZodSchema } from 'zod';
import { relations } from 'drizzle-orm';
import { pgTable, varchar, numeric, json, integer } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { regions } from './regions';
import { subRegions } from './subRegions';
import { states } from './states';
import { cities } from './cities';

export const countries = pgTable('countries', {
	id: integer('id').primaryKey().notNull(),
	name: varchar('name', { length: 255 }).notNull(),
	iso3: varchar('iso3', { length: 3 }).notNull(),
	iso2: varchar('iso2', { length: 2 }).notNull(),
	numeric_code: varchar('numeric_code', { length: 15 }),
	phonecode: varchar('phonecode', { length: 15 }).notNull(),
	capital: varchar('capital', { length: 255 }),
	currency: varchar('currency', { length: 10 }),
	currency_name: varchar('currency_name', { length: 255 }),
	currency_symbol: varchar('currency_symbol', { length: 10 }),
	tld: varchar('tld', { length: 10 }), // Top-level domain
	native: varchar('native', { length: 255 }),
	region: varchar('region', { length: 255 }),
	region_id: integer('region_id').references(() => regions.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	subregion: varchar('subregion', { length: 255 }),
	subregion_id: integer('subregion_id').references(() => subRegions.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	nationality: varchar('nationality', { length: 255 }),
	timezones: json('timezones'),
	translations: json('translations'),
	latitude: numeric('latitude', { precision: 10, scale: 8 }),
	longitude: numeric('longitude', { precision: 11, scale: 8 }),
	emoji: varchar('emoji', { length: 5 }), // Unicode emoji
	emojiU: varchar('emoji_u', { length: 25 }), // Unicode sequence
});

export const countriesRelations = relations(countries, ({ one, many }) => ({
	region: one(regions, {
		fields: [countries.region_id],
		references: [regions.id],
	}),
	subRegion: one(subRegions, {
		fields: [countries.subregion_id],
		references: [subRegions.id],
	}),
	states: many(states),
	cities: many(cities),
}));

export type SelectCountry = typeof cities.$inferSelect;
export type InsertCountry = typeof cities.$inferInsert;

export const selectCountriesSchema = createSelectSchema(countries);

export const insertCountriesSchema = createInsertSchema(countries);

export const patchCountriesSchema: ZodSchema = insertCountriesSchema.partial();
