import { pgTable, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { users } from './users';
import { items } from './items';

export const user_items_favorites = pgTable(
	'user_items_favorites',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		item_id: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index('user_favorites_user_id_idx').on(table.user_id),
		index('user_favorites_item_id_idx').on(table.item_id),
		index('user_favorites_unique_user_item_idx').on(table.user_id, table.item_id),
	],
);

export const user_items_favoritesRelations = relations(user_items_favorites, ({ one }) => ({
	user: one(users, {
		fields: [user_items_favorites.user_id],
		references: [users.id],
	}),
	item: one(items, {
		fields: [user_items_favorites.item_id],
		references: [items.id],
	}),
}));

export type SelectUserFavorite = typeof user_items_favorites.$inferSelect;
export type InsertUserFavorite = typeof user_items_favorites.$inferInsert;

export const selectUserItemsFavoritesSchema = createSelectSchema(user_items_favorites);

export const insertUserItemsFavoritesSchema = createInsertSchema(user_items_favorites);

export const patchUserFavoritesSchema = insertUserItemsFavoritesSchema.partial();
