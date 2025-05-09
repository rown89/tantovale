import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

export const shippings = pgTable('shippings', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	created_at: timestamp('created_at').notNull().defaultNow(),
	updated_at: timestamp('updated_at').notNull().defaultNow(),
});

export const shippingsSelectSchema = createSelectSchema(shippings);
export const shippingsInsertSchema = createInsertSchema(shippings);
