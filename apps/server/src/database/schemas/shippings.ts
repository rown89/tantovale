import { relations } from 'drizzle-orm';
import { pgTable, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { items } from './items';

export const shippings = pgTable('shippings', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	item_id: integer('item_id').references(() => items.id),
	shipping_price: integer('shipping_price').notNull(),
	tracking_number: text('tracking_number'),
	tracking_url: text('tracking_url'),
	tracking_status: text('tracking_status'),
	tracking_status_description: text('tracking_status_description'),
	tracking_status_updated_at: timestamp('tracking_status_updated_at'),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const shippingsRelations = relations(shippings, ({ one }) => ({
	item: one(items, {
		fields: [shippings.item_id],
		references: [items.id],
	}),
}));

export type SelectShipping = typeof shippings.$inferSelect;
export type InsertShipping = typeof shippings.$inferInsert;

export const shippingsSelectSchema = createSelectSchema(shippings);
export const shippingsInsertSchema = createInsertSchema(shippings);
