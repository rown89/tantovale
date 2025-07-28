import { pgTable, integer, timestamp, varchar, foreignKey } from 'drizzle-orm/pg-core';

import { orders } from './orders';

export const entityPlatformTransactions = pgTable(
	'entity_platform_transactions',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		entityId: integer('order_id').references(() => orders.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
		charge: integer('charge').notNull(),
		currency: varchar('currency', { length: 10 }).notNull().default('eur'),
		created_at: timestamp('created_at').notNull().defaultNow(),
		updated_at: timestamp('updated_at').notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			columns: [table.entityId],
			foreignColumns: [orders.id],
			name: 'entity_platform_transactions_entity_id_fkey',
		}),
	],
);
