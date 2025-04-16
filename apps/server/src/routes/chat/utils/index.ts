import { createClient } from 'src/database';
import { chat_messages } from 'src/database/schemas/chat_messages';
import { chat_room } from 'src/database/schemas/chat_room';

export async function createRoom({ item_id, buyer_id }: { item_id: number; buyer_id: number }) {
	const { db } = createClient();

	// Create a new chat room
	const newRoomResult = await db
		.insert(chat_room)
		.values({
			item_id,
			buyer_id,
		})
		.returning({ id: chat_room.id });

	return newRoomResult;
}

export async function sendChatRoomMessage({
	chat_room_id,
	sender_id,
	message,
}: {
	chat_room_id: number;
	sender_id: number;
	message: string;
}) {
	const { db } = createClient();

	// Send a message to a specific chat room
	const newMessageResult = await db
		.insert(chat_messages)
		.values({
			chat_room_id,
			sender_id,
			message,
		})
		.returning();

	return newMessageResult;
}
