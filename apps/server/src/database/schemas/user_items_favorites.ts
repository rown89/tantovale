import { pgTable, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { users } from './users';
import { items } from './items';

export const userItemsFavorites = pgTable(
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

export const userItemsFavoritesRelations = relations(userItemsFavorites, ({ one }) => ({
	user: one(users, {
		fields: [userItemsFavorites.user_id],
		references: [users.id],
	}),
	item: one(items, {
		fields: [userItemsFavorites.item_id],
		references: [items.id],
	}),
}));

export type SelectUserFavorite = typeof userItemsFavorites.$inferSelect;
export type InsertUserFavorite = typeof userItemsFavorites.$inferInsert;

export const selectUserItemsFavoritesSchema = createSelectSchema(userItemsFavorites);

export const insertUserItemsFavoritesSchema = createInsertSchema(userItemsFavorites);

export const patchUserFavoritesSchema = insertUserItemsFavoritesSchema.partial();
