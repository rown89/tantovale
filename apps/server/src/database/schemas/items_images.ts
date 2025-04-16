import { pgTable, integer, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

import { items } from './items';
import { itemImagesSizeEnum } from './enumerated_types';

export const itemsImages = pgTable(
	'items_images',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		item_id: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		url: text('url').notNull(),
		order_position: integer().notNull().default(0),
		size: itemImagesSizeEnum('size').notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('item_id_idx').on(table.item_id)],
);

export const itemImagesRelations = relations(itemsImages, ({ one }) => ({
	item: one(items, {
		fields: [itemsImages.item_id],
		references: [items.id],
	}),
}));

export type SelectItemImage = typeof itemsImages.$inferSelect;
export type InsertItemImage = typeof itemsImages.$inferInsert;
