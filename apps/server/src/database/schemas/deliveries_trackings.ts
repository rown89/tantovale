import { pgTable, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { deliveries } from './deliveries';

export const deliveries_trackings = pgTable('deliveries_trackings', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	delivery_id: integer('delivery_id').references(() => deliveries.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	tracking_number: text('tracking_number').notNull(),
	tracking_url: text('tracking_url').notNull(),
	tracking_status: text('tracking_status').notNull(),
	tracking_status_description: text('tracking_status_description').notNull(),
	tracking_status_updated_at: timestamp('tracking_status_updated_at').notNull(),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const deliveries_trackingsSelectSchema = createSelectSchema(deliveries_trackings);
export const deliveries_trackingsInsertSchema = createInsertSchema(deliveries_trackings);
