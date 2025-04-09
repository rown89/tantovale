import { eq, and, or, isNull, not, desc, max } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createClient } from '../../database';
import { chat_room, chat_messages, users, items } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';

export const chatRoute = createRouter()
	.get(`/${authPath}/rooms`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { db } = createClient();

		try {
			const lastMessagesSubquery = db
				.select({
					chat_room_id: chat_messages.chat_room_id,
					max_id: max(chat_messages.id).as('max_id'),
				})
				.from(chat_messages)
				.groupBy(chat_messages.chat_room_id)
				.as('latest_messages');

			// Now perform the main query with proper joins
			const chatRooms = await db
				.select({
					id: chat_room.id,
					item_id: chat_room.item_id,
					buyer_id: chat_room.buyer_id,
					created_at: chat_room.created_at,
					updated_at: chat_room.updated_at,
					item_title: items.title,
					item_price: items.price,
					item_status: items.status,
					item_published: items.published,
					buyer_username: users.username,
					last_message: chat_messages.message,
					last_message_id: chat_messages.id,
					last_message_created_at: chat_messages.created_at,
					last_message_read_at: chat_messages.read_at,
					last_message_sender_id: chat_messages.sender_id,
				})
				.from(chat_room)
				.innerJoin(items, eq(chat_room.item_id, items.id))
				.innerJoin(users, eq(chat_room.buyer_id, users.id))
				.leftJoin(lastMessagesSubquery, eq(chat_room.id, lastMessagesSubquery.chat_room_id))
				.leftJoin(
					chat_messages,
					and(
						eq(chat_messages.chat_room_id, chat_room.id),
						eq(chat_messages.id, lastMessagesSubquery.max_id),
						eq(items.published, true),
						eq(items.status, 'available'),
					),
				)
				.where(
					or(
						eq(items.user_id, user.id), // User is the seller
						eq(chat_room.buyer_id, user.id), // User is the buyer
					),
				)
				.orderBy(desc(chat_room.created_at))
				.limit(100);

			// Transform the chatRooms to match the expected shape
			const formattedChatRooms = chatRooms.map((room) => ({
				id: room.id,
				item: {
					id: room.item_id,
					title: room.item_title,
					price: room.item_price,
					status: room.item_status,
					published: room.item_published,
				},
				author: {
					id: room.last_message_sender_id, // Assuming the sender is the author
					username: room.buyer_username, // Assuming the buyer is the author
				},
				buyer: {
					id: room.buyer_id,
					username: room.buyer_username,
				},
				last_message: {
					id: room.last_message_id,
					message: room.last_message,
					read_at: room.last_message_read_at,
					created_at: room.last_message_created_at,
					sender_id: room.last_message_sender_id,
				},
			}));

			return c.json(formattedChatRooms, 200);
		} catch (error) {
			console.log(error);
			return c.json([], 500);
		}
	})
	// Create a new chat room
	.post(
		`/${authPath}/rooms`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				item_id: z.number(),
			}),
		),
		async (c) => {
			const user = c.var.user;
			const { db } = createClient();
			const body = await c.req.json();

			// Check if the item exists and user is not the owner
			const itemResult = await db.select().from(items).where(eq(items.id, body.item_id));

			const item = itemResult[0];

			if (!item) {
				return c.json({ error: 'Item not found' }, 404);
			}

			if (item.user_id === user.id) {
				return c.json({ error: 'You cannot chat about your own item' }, 400);
			}

			// Check if a chat room already exists for this item and buyer
			const existingRoomResult = await db
				.select({ id: chat_room.id })
				.from(chat_room)
				.where(and(eq(chat_room.item_id, body.item_id), eq(chat_room.buyer_id, user.id)));

			const existingRoom = existingRoomResult[0];

			if (existingRoom) {
				return c.json({ id: existingRoom.id });
			}

			// Create a new chat room
			const newRoomResult = await db
				.insert(chat_room)
				.values({
					item_id: body.item_id,
					buyer_id: user.id,
				})
				.returning({ id: chat_room.id });

			return c.json({ id: newRoomResult[0]?.id });
		},
	)
	// Get messages for a specific chat room
	.get(`/${authPath}/rooms/:roomId/messages`, authMiddleware, async (c) => {
		const user = c.var.user;
		const roomId = Number(c.req.param('roomId'));
		const { db } = createClient();

		try {
			// Start a transaction
			return await db.transaction(async (tx) => {
				// Verify the user has access to this chat room
				const roomResult = await tx
					.select({
						id: chat_room.id,
						buyer_id: chat_room.buyer_id,
						seller_id: items.user_id,
					})
					.from(chat_room)
					.innerJoin(items, eq(chat_room.item_id, items.id))
					.where(eq(chat_room.id, roomId));

				if (roomResult.length === 0) {
					return c.json({ error: 'Chat room not found' }, 404);
				}

				// Check if user is either the buyer or the seller
				const room = roomResult[0];
				if (room?.buyer_id !== user.id && room?.seller_id !== user.id) {
					return c.json({ error: 'Unauthorized access to chat room' }, 403);
				}

				// Get messages
				const messagesResult = await tx
					.select({
						id: chat_messages.id,
						message: chat_messages.message,
						created_at: chat_messages.created_at,
						read_at: chat_messages.read_at,
						sender_id: users.id,
						sender_username: users.username,
					})
					.from(chat_messages)
					.innerJoin(users, eq(chat_messages.sender_id, users.id))
					.where(eq(chat_messages.chat_room_id, roomId))
					.orderBy(chat_messages.created_at);

				const messages = messagesResult.map((msg) => ({
					id: msg.id,
					message: msg.message,
					created_at: msg.created_at,
					read_at: msg.read_at,
					sender: {
						id: msg.sender_id,
						username: msg.sender_username,
					},
					sender_id: msg.sender_id, // Keep this for the filter below
				}));

				// Mark unread messages as read if the user is not the sender
				const unreadMessages = messages.filter((msg) => !msg.read_at && msg.sender_id !== user.id);

				if (unreadMessages.length > 0) {
					await tx
						.update(chat_messages)
						.set({ read_at: new Date() })
						.where(
							and(
								eq(chat_messages.chat_room_id, roomId),
								isNull(chat_messages.read_at),
								not(eq(chat_messages.sender_id, user.id)),
							),
						);
				}

				return c.json(messages);
			});
		} catch (error) {
			console.error('Error in chat messages endpoint:', error);
			return c.json({ error: 'Failed to fetch messages' }, 500);
		}
	})
	// Send a message in a chat room
	.post(
		`/${authPath}/rooms/:roomId/messages`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				message: z.string(),
			}),
		),
		async (c) => {
			const user = c.var.user;
			const roomId = Number(c.req.param('roomId'));
			const body = await c.req.json();
			const { db } = createClient();

			// Verify the user has access to this chat room
			const roomResult = await db
				.select({
					id: chat_room.id,
					buyer_id: chat_room.buyer_id,
					seller_id: items.user_id,
				})
				.from(chat_room)
				.innerJoin(items, eq(chat_room.item_id, items.id))
				.where(eq(chat_room.id, roomId));

			if (roomResult.length === 0) {
				return c.json({ error: 'Chat room not found' }, 404);
			}

			// Check if user is either the buyer or the seller
			const room = roomResult[0];
			if (room?.buyer_id !== user.id && room?.seller_id !== user.id) {
				return c.json({ error: 'Unauthorized access to chat room' }, 403);
			}

			// Send the message
			const newMessageResult = await db
				.insert(chat_messages)
				.values({
					chat_room_id: roomId,
					sender_id: user.id,
					message: body.message,
				})
				.returning();

			// Update the chat room's updated_at timestamp
			await db.update(chat_room).set({ updated_at: new Date() }).where(eq(chat_room.id, roomId));

			return c.json(newMessageResult[0]);
		},
	);
