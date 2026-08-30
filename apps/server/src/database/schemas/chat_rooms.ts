import { pgTable, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod';

import { items } from './items';
import { profiles } from './profiles';

export const chat_rooms = pgTable(
	'chat_rooms',
	{
		id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
		item_id: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		buyer_id: integer('buyer_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [uniqueIndex('chat_rooms_item_buyer_idx').on(table.item_id, table.buyer_id)],
);

export type SelectChatRoom = typeof chat_rooms.$inferSelect;
export type InsertChatRoom = typeof chat_rooms.$inferInsert;

export const selectChatRoomSchema = createSelectSchema(chat_rooms);

export const insertChatRoomSchema = createInsertSchema(chat_rooms);

export const patchChatRoomSchema = insertChatRoomSchema.partial();
