import { createClient } from 'src/database';
import { createRouter } from 'src/lib/create-app';
import { ordersProposals } from 'src/database/schemas/orders_proposals';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authPath } from 'src/utils/constants';
import { orderProposalStatusValues } from 'src/database/schemas/enumerated_values';
import { items } from 'src/database/schemas/items';
import { sendNewProposalMessage } from 'src/mailer/templates/order-proposal-received';
import { users } from 'src/database/schemas/users';
import { chat_room } from 'src/database/schemas/chat_room';
import { chat_messages } from 'src/database/schemas/chat_messages';
import { sendProposalAcceptedMessage } from 'src/mailer/templates/order-proposal-accepted';
import { sendProposalRejectedMessage } from 'src/mailer/templates/order-proposal-rejected';

export const ordersProposalsRoute = createRouter()
	.post(
		`${authPath}/create`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				item_id: z.number(),
				price: z.number(),
				message: z.string().optional(),
			}),
		),
		async (c) => {
			const { item_id, price, message } = c.req.valid('json');
			const user = c.var.user;

			const { db } = createClient();

			try {
				return await db.transaction(async (tx) => {
					// check if the item exists and is available and published
					const [item] = await tx
						.select({
							id: items.id,
							title: items.title,
							user_id: items.user_id,
						})
						.from(items)
						.where(and(eq(items.id, item_id), eq(items.status, 'available'), eq(items.published, true)))
						.limit(1);

					if (!item) return c.json({ error: 'Item not found' }, 404);

					// check if the user already has a proposal in pending status for this item
					const [proposalAlreadyExists] = await tx
						.select()
						.from(ordersProposals)
						.where(
							and(
								eq(ordersProposals.item_id, item_id),
								eq(ordersProposals.user_id, user.id),
								eq(ordersProposals.status, 'pending'),
							),
						)
						.limit(1);

					if (proposalAlreadyExists) return c.json({ error: 'Proposal already exists' }, 400);

					// create a new proposal
					const [proposal] = await tx
						.insert(ordersProposals)
						.values({
							item_id,
							user_id: user.id,
							price,
						})
						.returning();

					if (!proposal) return c.json({ error: 'Proposal not found' }, 404);

					// get the item owner email
					const [itemOwner] = await tx
						.select({ email: users.email })
						.from(users)
						.where(eq(users.id, item.user_id))
						.limit(1);

					if (!itemOwner) return c.json({ error: 'Item owner not found' }, 404);

					// check if user already has an ongoing chat with the item owner
					const [chatRoom] = await tx
						.select()
						.from(chat_room)
						.where(and(eq(chat_room.item_id, item_id), eq(chat_room.buyer_id, user.id)))
						.limit(1);

					let chatRoomId = null;

					if (chatRoom) {
						// send a new chat message of type proposal
						const [newChatMessage] = await tx
							.insert(chat_messages)
							.values({
								chat_room_id: chatRoom.id,
								sender_id: user.id,
								order_proposal_id: proposal.id,
								message: message || `Proposal from ${user.username} for the object ${item.title}`,
								message_type: 'proposal',
							})
							.returning();

						if (!newChatMessage) return c.json({ error: 'Chat message not found' }, 404);

						chatRoomId = chatRoom.id;
					} else {
						// create a new chat room
						const [newChatRoom] = await tx
							.insert(chat_room)
							.values({
								item_id,
								buyer_id: user.id,
							})
							.returning();

						if (!newChatRoom) return c.json({ error: 'Chat room not found' }, 404);

						chatRoomId = newChatRoom.id;
					}

					await sendNewProposalMessage({
						to: itemOwner.email,
						roomId: chatRoomId,
						buyer_username: user.username,
						itemName: item.title,
						message: message || `Proposal from ${user.username} for the object ${item.title}`,
					});

					return c.json(proposal);
				});
			} catch (error) {
				console.error('Error creating proposal:', error);
				return c.json({ error: 'Failed to create proposal' }, 500);
			}
		},
	)
	.get(`${authPath}/:id`, authMiddleware, async (c) => {
		const id = Number(c.req.param('id'));

		const { db } = createClient();

		const proposal = await db
			.select({
				status: ordersProposals.status,
				price: ordersProposals.price,
			})
			.from(ordersProposals)
			.where(eq(ordersProposals.id, id))
			.limit(1);

		if (!proposal[0]) return c.json({ error: 'Proposal not found' }, 404);

		return c.json(proposal[0]);
	})
	.put(
		`${authPath}`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				id: z.number(),
				status: z.enum(orderProposalStatusValues),
				item_id: z.number(),
			}),
		),
		async (c) => {
			const user = c.var.user;
			const { id, status, item_id } = await c.req.valid('json');

			const { db } = createClient();

			// check if the item exists and is owned by the user (merchant)
			const [item] = await db
				.select()
				.from(items)
				.where(and(eq(items.id, item_id), eq(items.user_id, user.id)))
				.limit(1);

			if (!item) return c.json({ error: 'Item not found' }, 404);
			if (item.user_id !== user.id) return c.json({ error: 'Item not found' }, 404);

			const [updatedProposal] = await db
				.update(ordersProposals)
				.set({ status })
				.where(eq(ordersProposals.id, id))
				.returning();

			if (!updatedProposal) return c.json({ error: 'Proposal not found' }, 404);
			if (updatedProposal.user_id !== user.id) return c.json({ error: 'Proposal not found' }, 404);

			// get the chat room
			const [chatRoom] = await db
				.select({ id: chat_room.id })
				.from(chat_room)
				.where(and(eq(chat_room.item_id, item_id), eq(chat_room.buyer_id, updatedProposal.user_id)))
				.limit(1);

			if (!chatRoom) return c.json({ error: 'Chat room not found, cannot send the proposal update	 message' }, 404);

			const [userProposal] = await db
				.select({
					email: users.email,
					username: users.username,
				})
				.from(users)
				.where(eq(users.id, updatedProposal.user_id))
				.limit(1);

			if (!userProposal) return c.json({ error: 'User not found' }, 404);

			if (status === 'accepted') {
				sendProposalAcceptedMessage({
					to: userProposal.email,
					roomId: chatRoom.id,
					merchant_username: user.username,
					itemName: item.title,
				});
			}

			if (status === 'rejected') {
				sendProposalRejectedMessage({
					to: userProposal.email,
					roomId: chatRoom.id,
					merchant_username: user.username,
					itemName: item.title,
				});
			}

			return c.json(updatedProposal);
		},
	);
