import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

import { chat_room } from './chat_room';
import { users } from './users';
import { chatMessageTypeEnum } from './enumerated_types';
import { ordersProposals } from './orders_proposals';

export const chat_messages = pgTable('chat_messages', {
	id: integer('id').primaryKey().notNull().generatedAlwaysAsIdentity(),
	chat_room_id: integer('chat_room_id')
		.notNull()
		.references(() => chat_room.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	sender_id: integer('sender_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	message: text('message').notNull(),
	message_type: chatMessageTypeEnum('message_type').notNull().default('text'),
	order_proposal_id: integer('order_proposal_id').references(() => ordersProposals.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade',
	}),
	read_at: timestamp('read_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectChatMessage = typeof chat_messages.$inferSelect;
export type InsertChatMessage = typeof chat_messages.$inferInsert;

export const selectChatMessageSchema = createSelectSchema(chat_messages);
export const insertChatMessageSchema = createInsertSchema(chat_messages);
export const patchChatMessageSchema = insertChatMessageSchema.partial();
