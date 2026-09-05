import { pgTable, integer, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod';

import { chat_rooms } from './chat_rooms';
import { profiles } from './profiles';
import { chatMessageTypeEnum } from './enumerated_types';
import { orders_proposals } from './orders_proposals';

export const chat_messages = pgTable('chat_messages', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	chat_room_id: integer('chat_room_id')
		.notNull()
		.references(() => chat_rooms.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	sender_id: integer('sender_id')
		.notNull()
		.references(() => profiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	message: text('message').notNull(),
	message_type: chatMessageTypeEnum('message_type').notNull().default('text'),
	order_proposal_id: integer('order_proposal_id').references(() => orders_proposals.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	metadata: jsonb('metadata'),
	read_at: timestamp('read_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectChatMessage = typeof chat_messages.$inferSelect;
export type InsertChatMessage = typeof chat_messages.$inferInsert;

export const selectChatMessageSchema = createSelectSchema(chat_messages);
export const insertChatMessageSchema = createInsertSchema(chat_messages);
export const patchChatMessageSchema = insertChatMessageSchema.partial();
