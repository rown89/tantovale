import { relations } from 'drizzle-orm';
import { pgTable, integer, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

import { itemStatusEnum } from './enumerated_types';
import { subcategories } from './subcategories';
import { addresses } from './addresses';
import { profiles } from './profiles';
import { itemStatus } from './enumerated_values';

export const items = pgTable(
	'items',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		profile_id: integer('profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		subcategory_id: integer('subcategory_id')
			.notNull()
			.references(() => subcategories.id, {
				onDelete: 'cascade',
				onUpdate: 'cascade',
			}),
		address_id: integer('address_id')
			.notNull()
			.references(() => addresses.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		title: text('title').notNull(),
		description: text('description').notNull(),
		status: itemStatusEnum('status').notNull().default(itemStatus.AVAILABLE),
		published: boolean('published').default(false).notNull(),
		price: integer('price').notNull().default(0),
		easy_pay: boolean('easy_pay').notNull().default(false),
		item_weight: integer('item_weight'),
		item_length: integer('item_length'),
		item_width: integer('item_width'),
		item_height: integer('item_height'),
		custom_shipping_price: integer('custom_shipping_price'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deleted_at: timestamp('deleted_at', { mode: 'date' }),
	},
	(table) => [
		index('profile_id_idx').on(table.profile_id),
		index('address_id_idx').on(table.address_id),
		index('title_idx').on(table.title),
		index('subcategory_id_idx').on(table.subcategory_id),
		index('easy_pay_idx').on(table.easy_pay),
		index('published_idx').on(table.published),
		index('status_idx').on(table.status),
	],
);

export const itemsRelations = relations(items, ({ one, many }) => ({
	author: one(profiles, {
		fields: [items.profile_id],
		references: [profiles.id],
	}),
	subcategory: one(subcategories, {
		fields: [items.subcategory_id],
		references: [subcategories.id],
	}),
	address: one(addresses, {
		fields: [items.address_id],
		references: [addresses.id],
	}),
}));

export type SelectItem = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

export const selectItemsSchema = createSelectSchema(items);
export const insertItemsSchema = createInsertSchema(items);

export const patchItemsSchema = insertItemsSchema.partial();
