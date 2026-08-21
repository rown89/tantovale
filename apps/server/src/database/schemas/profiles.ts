import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod';
import { pgTable, integer, timestamp, date, boolean, varchar, index } from 'drizzle-orm/pg-core';

import { profileEnum, sexEnum } from './enumerated_types';
import { users } from './users';

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
		payment_provider_id: varchar('payment_provider_id', { length: 100 }),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index('profiles_name_surname_idx').on(table.name, table.surname)],
);

export type SelectProfile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

export const selectProfilesSchema = createSelectSchema(profiles);
export const insertProfilesSchema = createInsertSchema(profiles);
export const patchProfilesSchema = insertProfilesSchema.partial();
