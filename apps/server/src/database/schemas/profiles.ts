import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { pgTable, integer, timestamp, date, text, boolean, varchar, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

import { profileEnum, sexEnum } from './enumerated_types';
import { users } from './users';
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
		name: varchar('name', { length: 50 }).notNull(),
		surname: varchar('surname', { length: 50 }).notNull(),
		vat_number: varchar('vat_number', { length: 50 }),
		birthday: date('birthday'),
		gender: sexEnum('gender').notNull(),
		privacy_policy: boolean('privacy_policy').default(false).notNull(),
		marketing_policy: boolean('marketing_policy').default(false).notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index('profiles_name_surname_idx').on(table.name, table.surname)],
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
	user: one(users),
	city: one(cities),
}));

export type SelectProfile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

export const selectProfilesSchema = createSelectSchema(profiles);

export const insertProfilesSchema = createInsertSchema(profiles);

export const patchProfilesSchema = insertProfilesSchema.partial();
