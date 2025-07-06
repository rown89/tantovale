import { eq, and, or, isNull, not, desc, max } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { differenceInMinutes } from 'date-fns';

import { createClient } from '../../database';
import { chat_rooms, chat_messages, users, items, profiles } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { sendNewMessageWarning } from 'src/mailer/templates/new-email-message';
import { ChatMessageSchema } from 'src/extended_schemas';
import { createRoom, sendChatRoomMessage } from './utils';
import { ChatMessageMetadata, itemStatus } from '#database/schemas/enumerated_values';

export const chatRoute = createRouter()
	// get all user chat rooms
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

			const usersBuyer = alias(users, 'users_buyer');
			const usersSeller = alias(users, 'users_seller');
			const profilesBuyer = alias(profiles, 'profiles_buyer');
			const profilesSeller = alias(profiles, 'profiles_seller');

			// Now perform the main query with proper joins
			const chatRooms = await db
				.select({
					id: chat_rooms.id,
					item_id: chat_rooms.item_id,
					buyer_id: chat_rooms.buyer_id,
					created_at: chat_rooms.created_at,
					updated_at: chat_rooms.updated_at,
					item_title: items.title,
					item_price: items.price,
					item_status: items.status,
					item_published: items.published,
					buyer_username: usersBuyer.username,
					buyer_user_id: usersBuyer.id,
					seller_id: items.profile_id,
					seller_username: usersSeller.username,
					seller_user_id: usersSeller.id,
					last_message: chat_messages.message,
					last_message_id: chat_messages.id,
					last_message_created_at: chat_messages.created_at,
					last_message_read_at: chat_messages.read_at,
					last_message_sender_id: users.id,
				})
				.from(chat_rooms)
				.innerJoin(items, eq(chat_rooms.item_id, items.id))
				.innerJoin(profilesBuyer, eq(chat_rooms.buyer_id, profilesBuyer.id))
				.innerJoin(usersBuyer, eq(profilesBuyer.user_id, usersBuyer.id))
				.innerJoin(profilesSeller, eq(items.profile_id, profilesSeller.id))
				.innerJoin(usersSeller, eq(profilesSeller.user_id, usersSeller.id))
				.leftJoin(lastMessagesSubquery, eq(chat_rooms.id, lastMessagesSubquery.chat_room_id))
				.leftJoin(
					chat_messages,
					and(
						eq(chat_messages.chat_room_id, chat_rooms.id),
						eq(chat_messages.id, lastMessagesSubquery.max_id),
						eq(items.published, true),
						eq(items.status, itemStatus.AVAILABLE),
					),
				)
				.leftJoin(profiles, eq(chat_messages.sender_id, profiles.id))
				.leftJoin(users, eq(profiles.user_id, users.id))
				.where(
					or(
						eq(profilesSeller.user_id, user.id), // User is the seller
						eq(chat_rooms.buyer_id, user.profile_id), // User is the buyer
					),
				)
				.orderBy(desc(chat_rooms.created_at))
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
					id: room.seller_user_id, // Return user ID instead of profile ID
					username: room.seller_username, // Using seller's username
				},
				buyer: {
					id: room.buyer_user_id, // Return user ID instead of profile ID
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
	// get chat room id by item_id
	.get(`/${authPath}/rooms/id/:item_id`, authMiddleware, async (c) => {
		const user = c.var.user;
		const item_id = Number(c.req.param('item_id'));

		if (!item_id) return c.json({ error: 'Item id is required' }, 400);
		if (isNaN(item_id)) return c.json({ message: 'Invalid Item ID' }, 400);

		const { db } = createClient();

		try {
			const existingRoom = await db
				.select({
					id: chat_rooms.id,
				})
				.from(chat_rooms)
				.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, user.profile_id)))
				.limit(1);

			const id = existingRoom?.[0]?.id;

			return c.json({ id }, 200);
		} catch (error) {
			return c.json(
				{
					message: error instanceof Error ? error.message : 'Error retrieving chat_id by item id',
				},
				500,
			);
		}
	})
	// Get messages for a specific chat room
	.get(`/${authPath}/rooms/:roomId/messages`, authMiddleware, async (c) => {
		const user = c.var.user;
		const roomId = Number(c.req.param('roomId'));

		if (!roomId) return c.json({ error: 'room id is required' }, 400);
		if (isNaN(roomId)) return c.json({ message: 'Invalid room ID' }, 400);

		const { db } = createClient();

		try {
			// Start a transaction
			return await db.transaction(async (tx) => {
				// Verify the user has access to this chat room
				const roomResult = await tx
					.select({
						id: chat_rooms.id,
						buyer_id: chat_rooms.buyer_id,
						seller_id: items.profile_id,
					})
					.from(chat_rooms)
					.innerJoin(items, eq(chat_rooms.item_id, items.id))
					.where(eq(chat_rooms.id, roomId));

				if (roomResult.length === 0) {
					return c.json({ error: 'Chat room not found' }, 404);
				}

				// Check if user is either the buyer or the seller
				const room = roomResult[0];
				if (room?.buyer_id !== user.profile_id && room?.seller_id !== user.profile_id) {
					return c.json({ error: 'Unauthorized access to chat room' }, 403);
				}

				// Get messages
				const messagesResult = await tx
					.select({
						id: chat_messages.id,
						message: chat_messages.message,
						message_type: chat_messages.message_type,
						order_proposal_id: chat_messages.order_proposal_id,
						created_at: chat_messages.created_at,
						read_at: chat_messages.read_at,
						sender_id: users.id,
						sender_username: users.username,
						metadata: chat_messages.metadata,
					})
					.from(chat_messages)
					.innerJoin(profiles, eq(chat_messages.sender_id, profiles.id))
					.innerJoin(users, eq(profiles.user_id, users.id))
					.where(eq(chat_messages.chat_room_id, roomId))
					.orderBy(chat_messages.created_at);

				const messages = messagesResult.map((msg) => ({
					id: msg.id,
					message: msg.message,
					message_type: msg.message_type,
					order_proposal_id: msg.order_proposal_id,
					created_at: msg.created_at,
					read_at: msg.read_at,
					sender: {
						id: msg.sender_id,
						username: msg.sender_username,
					},
					sender_id: msg.sender_id, // Keep this for the filter below
					metadata: msg.metadata as ChatMessageMetadata,
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
								not(eq(chat_messages.sender_id, user.profile_id)),
							),
						);
				}

				return c.json(messages, 200);
			});
		} catch (error) {
			console.error('Error in chat messages endpoint:', error);
			return c.json({ error: 'Failed to fetch messages' }, 500);
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
			const { item_id } = c.req.valid('json');

			const { db } = createClient();

			// Check if the item exists and user is not the owner
			const itemResult = await db.select().from(items).where(eq(items.id, item_id));

			const item = itemResult[0];

			if (!item) {
				return c.json({ error: 'Item not found' }, 404);
			}

			if (item.profile_id === user.profile_id) {
				return c.json({ error: 'You cannot chat about your own item' }, 400);
			}

			// Check if a chat room already exists for this item and buyer
			const existingRoomResult = await db
				.select({ id: chat_rooms.id })
				.from(chat_rooms)
				.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, user.profile_id)));

			const existingRoom = existingRoomResult[0];

			if (existingRoom) {
				return c.json({ id: existingRoom.id });
			}

			// Create a new chat room
			const newRoomResult = await createRoom({
				item_id,
				buyer_id: user.profile_id,
			});

			return c.json({ id: newRoomResult[0]?.id });
		},
	)
	// Send a message in a chat room
	.post(`/${authPath}/rooms/:roomId/messages`, authMiddleware, zValidator('json', ChatMessageSchema), async (c) => {
		const user = c.var.user;
		const roomId = Number(c.req.param('roomId'));

		const { message } = c.req.valid('json');

		const { db } = createClient();

		// Verify the user has access to this chat room
		const roomResult = await db
			.select({
				id: chat_rooms.id,
				buyer_id: chat_rooms.buyer_id,
				seller_id: items.profile_id,
			})
			.from(chat_rooms)
			.innerJoin(items, eq(chat_rooms.item_id, items.id))
			.where(eq(chat_rooms.id, roomId));

		if (roomResult.length === 0) {
			return c.json({ error: 'Chat room not found' }, 404);
		}

		// Check if user is either the buyer or the seller
		const room = roomResult[0];
		if (room?.buyer_id !== user.profile_id && room?.seller_id !== user.profile_id) {
			return c.json({ error: 'Unauthorized access to chat room' }, 403);
		}

		const recentMessagesResult = await db
			.select({
				sender_id: chat_messages.sender_id,
				created_at: chat_messages.created_at,
			})
			.from(chat_messages)
			.where(and(eq(chat_messages.chat_room_id, roomId), eq(chat_messages.sender_id, user.profile_id)))

			.orderBy(desc(chat_messages.created_at))
			.limit(1);

		// Get the first message from the result (if any)
		const recentMessage = recentMessagesResult[0];

		// Check if there's a recent message and if we need to send an alert
		if (recentMessage) {
			const maxMinutes = 5;

			// If last message date is over maxMinutes then we send the email
			const shouldSendEmailAlert = differenceInMinutes(new Date(), recentMessage.created_at) > maxMinutes;

			if (shouldSendEmailAlert) {
				// Determine recipient (the one who is NOT sending the message)
				const recipientProfileId = user.profile_id === room.buyer_id ? room.seller_id : room.buyer_id;

				// Get recipient email by first getting the profile's user_id
				const [recipientProfile] = await db
					.select({
						user_id: profiles.user_id,
					})
					.from(profiles)
					.where(eq(profiles.id, recipientProfileId));

				if (recipientProfile) {
					const [recipient] = await db
						.select({
							email: users.email,
							username: users.username,
						})
						.from(users)
						.where(eq(users.id, recipientProfile.user_id));

					if (recipient) {
						// Send email notification
						await sendNewMessageWarning({
							to: recipient.email,
							roomId,
							username: user.username,
							message,
						});

						// Log that notification was sent
						console.log(`Email notification sent to ${recipient.email} for room ${roomId}`);
					}
				}
			}
		} else {
			// No previous messages in this room, we should send an email
			const recipientProfileId = user.profile_id === room.buyer_id ? room.seller_id : room.buyer_id;

			// Get recipient email by first getting the profile's user_id
			const [recipientProfile] = await db
				.select({
					user_id: profiles.user_id,
				})
				.from(profiles)
				.where(eq(profiles.id, recipientProfileId));

			if (recipientProfile) {
				const [recipient] = await db
					.select({
						email: users.email,
						username: users.username,
					})
					.from(users)
					.where(eq(users.id, recipientProfile.user_id));

				if (recipient) {
					// Send email notification
					await sendNewMessageWarning({
						to: recipient.email,
						roomId,
						username: user.username,
						message,
					});

					console.log(`Email notification sent to ${recipient.email} for room ${roomId}`);
				}
			}
		}

		// Send message
		const newMessageResult = await sendChatRoomMessage({
			chat_room_id: roomId,
			sender_id: user.profile_id,
			message,
		});

		// Update the chat room's updated_at timestamp
		await db.update(chat_rooms).set({ updated_at: new Date() }).where(eq(chat_rooms.id, roomId));

		return c.json(newMessageResult?.[0]);
	});
