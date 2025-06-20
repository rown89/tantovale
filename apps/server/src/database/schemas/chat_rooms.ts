import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

import { items } from './items';
import { chat_messages } from './chat_messages';
import { profiles } from './profiles';

export const chat_rooms = pgTable('chat_rooms', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	item_id: integer('item_id')
		.notNull()
		.references(() => items.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	buyer_id: integer('buyer_id')
		.notNull()
		.references(() => profiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatRoomRelations = relations(chat_rooms, ({ one, many }) => ({
	item: one(items, {
		fields: [chat_rooms.item_id],
		references: [items.id],
	}),
	buyer: one(profiles, {
		fields: [chat_rooms.buyer_id],
		references: [profiles.id],
	}),
	messages: many(chat_messages),
}));

export type SelectChatRoom = typeof chat_rooms.$inferSelect;
export type InsertChatRoom = typeof chat_rooms.$inferInsert;

export const selectChatRoomSchema = createSelectSchema(chat_rooms);

export const insertChatRoomSchema = createInsertSchema(chat_rooms);

export const patchChatRoomSchema = insertChatRoomSchema.partial();
