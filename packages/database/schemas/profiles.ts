import { pgTable, integer, timestamp, date, check, text, varchar, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { items } from './items';
import { profileEnum, sexEnum } from './enumerated_types';
import { users } from './users';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { cities } from './cities';

export const profiles = pgTable(
	'profiles',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity().notNull(),
		profile_type: profileEnum('profile_type').notNull().default('private'),
		user_id: integer('user_id')
			.unique()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		fullname: varchar('fullname', { length: 50 }).notNull(),
		vat_number: varchar('vat_number', { length: 50 }),
		birthday: date('birthday'),
		gender: sexEnum('gender'),
		city: integer('city').references(() => cities.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		// street_address: text('street_address'),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('profiles_fullname_idx').on(table.fullname),
		check('birthday_check1', sql`${table.profile_type} != 'private' OR ${table.birthday} IS NOT NULL`),
		check('sex_check1', sql`${table.profile_type} != 'private' OR ${table.gender} IS NOT NULL`),
	],
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
	user: one(users),
	city: one(cities),
	items: many(items),
}));

export type SelectProfile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

export const selectProfilesSchema = createSelectSchema(profiles);

export const insertProfilesSchema = createInsertSchema(profiles);

export const patchProfilesSchema = insertProfilesSchema.partial();
