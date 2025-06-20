import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';

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
	read_at: timestamp('read_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessagesRelations = relations(chat_messages, ({ one }) => ({
	chat_room: one(chat_rooms, {
		fields: [chat_messages.chat_room_id],
		references: [chat_rooms.id],
	}),
	sender: one(profiles, {
		fields: [chat_messages.sender_id],
		references: [profiles.id],
	}),
	order_proposal: one(orders_proposals, {
		fields: [chat_messages.order_proposal_id],
		references: [orders_proposals.id],
	}),
}));

export type SelectChatMessage = typeof chat_messages.$inferSelect;
export type InsertChatMessage = typeof chat_messages.$inferInsert;

export const selectChatMessageSchema = createSelectSchema(chat_messages);
export const insertChatMessageSchema = createInsertSchema(chat_messages);
export const patchChatMessageSchema = insertChatMessageSchema.partial();
