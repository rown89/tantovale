import { pgTable, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

export const shippings = pgTable('shippings', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	tracking_number: text('tracking_number'),
	tracking_url: text('tracking_url'),
	tracking_status: text('tracking_status'),
	tracking_status_description: text('tracking_status_description'),
	tracking_status_updated_at: timestamp('tracking_status_updated_at'),
	shipping_price: integer('shipping_price').notNull(),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export type SelectShipping = typeof shippings.$inferSelect;
export type InsertShipping = typeof shippings.$inferInsert;

export const shippingsSelectSchema = createSelectSchema(shippings);
export const shippingsInsertSchema = createInsertSchema(shippings);
