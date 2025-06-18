import { relations } from 'drizzle-orm';
import { pgTable, integer, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

import { profiles } from './profiles';
import { cities } from './cities';
import { addressStatusEnum } from './enumerated_types';

export const addresses = pgTable('addresses', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	profile_id: integer('profile_id').references(() => profiles.id),
	label: text('label').notNull().default('Home'),
	street_address: text('street_address').notNull(),
	civic_number: text('civic_number').notNull(),
	city_id: integer('city_id')
		.notNull()
		.references(() => cities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	province_id: integer('province_id')
		.notNull()
		.references(() => cities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	postal_code: integer('postal_code').notNull(),
	country_code: varchar('country_code', { length: 50 }).default('IT').notNull(),
	status: addressStatusEnum('status').notNull().default('active'),
	phone: text('phone').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const addressesRelations = relations(addresses, ({ many }) => ({
	profile: many(profiles),
}));

export type SelectAddress = typeof addresses.$inferSelect;
export type InsertAddress = typeof addresses.$inferInsert;

export const selectAddressesSchema = createSelectSchema(addresses);
export const insertAddressesSchema = createInsertSchema(addresses);
