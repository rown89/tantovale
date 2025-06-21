import { pgTable, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { profiles } from './profiles';
import { items } from './items';

export const profiles_items_favorites = pgTable(
	'user_items_favorites',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		profile_id: integer('profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		item_id: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('profiles_favorites_profile_id_idx').on(table.profile_id),
		index('profiles_favorites_item_id_idx').on(table.item_id),
		index('profiles_favorites_unique_profile_item_idx').on(table.profile_id, table.item_id),
	],
);

export const profiles_items_favoritesRelations = relations(profiles_items_favorites, ({ one }) => ({
	profile: one(profiles, {
		fields: [profiles_items_favorites.profile_id],
		references: [profiles.id],
	}),
	item: one(items, {
		fields: [profiles_items_favorites.item_id],
		references: [items.id],
	}),
}));

export type SelectUserFavorite = typeof profiles_items_favorites.$inferSelect;
export type InsertUserFavorite = typeof profiles_items_favorites.$inferInsert;

export const selectUserItemsFavoritesSchema = createSelectSchema(profiles_items_favorites);

export const insertUserItemsFavoritesSchema = createInsertSchema(profiles_items_favorites);

export const patchUserFavoritesSchema = insertUserItemsFavoritesSchema.partial();
