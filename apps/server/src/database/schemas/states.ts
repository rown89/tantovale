import { pgTable, varchar, numeric, integer } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod';

import { countries } from './countries';

export const states = pgTable('states', {
	id: integer('id').primaryKey().notNull(),
	name: varchar('name', { length: 255 }).notNull(),
	country_id: integer('country_id')
		.notNull()
		.references(() => countries.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
	country_code: varchar('country_code', { length: 2 }).notNull(),
	state_code: varchar('state_code', { length: 10 }),
	type: varchar('type', { length: 50 }),
	latitude: numeric('latitude', { precision: 10, scale: 8 }),
	longitude: numeric('longitude', { precision: 11, scale: 8 }),
});

export type SelectState = typeof states.$inferSelect;
export type InsertState = typeof states.$inferInsert;

export const selectStatesSchema = createSelectSchema(states);

export const insertStatesSchema = createInsertSchema(states);

export const patchStatesSchema = insertStatesSchema.partial();
