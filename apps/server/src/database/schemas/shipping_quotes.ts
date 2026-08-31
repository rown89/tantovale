import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { addresses } from './addresses';
import { items } from './items';
import { profiles } from './profiles';

export const shipping_quotes = pgTable(
	'shipping_quotes',
	{
		id: uuid('id').primaryKey().notNull(),
		checkout_attempt_id: uuid('checkout_attempt_id').unique(),
		item_id: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		buyer_profile_id: integer('buyer_profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		seller_profile_id: integer('seller_profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		buyer_address_id: integer('buyer_address_id')
			.notNull()
			.references(() => addresses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		seller_address_id: integer('seller_address_id')
			.notNull()
			.references(() => addresses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		shippo_shipment_id: text('shippo_shipment_id').notNull(),
		shippo_rate_id: text('shippo_rate_id').notNull().unique(),
		amount: integer('amount').notNull(),
		currency: text('currency').notNull(),
		snapshot_fingerprint: text('snapshot_fingerprint').notNull(),
		expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
		consumed_at: timestamp('consumed_at', { withTimezone: true }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check('shipping_quotes_amount_positive', sql`${table.amount} > 0`),
		check('shipping_quotes_currency_eur', sql`${table.currency} = 'EUR'`),
		index('shipping_quotes_item_buyer_expiry_idx').on(table.item_id, table.buyer_profile_id, table.expires_at),
	],
);

export type SelectShippingQuote = typeof shipping_quotes.$inferSelect;
