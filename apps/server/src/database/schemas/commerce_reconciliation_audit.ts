import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const commerce_reconciliation_audit = pgTable(
	'commerce_reconciliation_audit',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		conflict_type: text('conflict_type').notNull(),
		source_table: text('source_table').notNull(),
		source_row_id: integer('source_row_id').notNull(),
		canonical_row_id: integer('canonical_row_id'),
		original_reference: text('original_reference'),
		snapshot: jsonb('snapshot').notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('commerce_reconciliation_audit_source_idx').on(table.source_table, table.source_row_id)],
);

export type SelectCommerceReconciliationAudit = typeof commerce_reconciliation_audit.$inferSelect;
