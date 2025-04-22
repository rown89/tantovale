import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

import { orderStatusEnum } from './enumerated_types';

export const orders = pgTable('orders', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	order_status: orderStatusEnum('order_status').notNull().default('pending'),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const ordersSelectSchema = createSelectSchema(orders);
export const ordersInsertSchema = createInsertSchema(orders);
