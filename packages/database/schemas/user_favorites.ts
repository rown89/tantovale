import { pgTable, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { items } from './items';
import { relations } from 'drizzle-orm';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

export const userFavorites = pgTable(
	'user_favorites',
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

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
	user: one(users, {
		fields: [userFavorites.user_id],
		references: [users.id],
	}),
	item: one(items, {
		fields: [userFavorites.item_id],
		references: [items.id],
	}),
}));

export type SelectUserFavorite = typeof userFavorites.$inferSelect;
export type InsertUserFavorite = typeof userFavorites.$inferInsert;

export const selectUserFavoritesSchema = createSelectSchema(userFavorites);

export const insertUserFavoritesSchema = createInsertSchema(userFavorites);

export const patchUserFavoritesSchema = insertUserFavoritesSchema.partial();
