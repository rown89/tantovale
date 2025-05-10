import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { deliveryMethodEnum } from './enumerated_types';

export const deliveries = pgTable('deliveries', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	delivery_method: deliveryMethodEnum('delivery_method').notNull(),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const deliveriesSelectSchema = createSelectSchema(deliveries);
export const deliveriesInsertSchema = createInsertSchema(deliveries);
