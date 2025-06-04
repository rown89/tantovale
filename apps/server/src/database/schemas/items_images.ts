import { pgTable, integer, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

import { items } from './items';
import { itemImagesSizeEnum } from './enumerated_types';

export const items_images = pgTable(
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

export const itemImagesRelations = relations(items_images, ({ one }) => ({
	item: one(items, {
		fields: [items_images.item_id],
		references: [items.id],
	}),
}));

export type SelectItemImage = typeof items_images.$inferSelect;
export type InsertItemImage = typeof items_images.$inferInsert;
