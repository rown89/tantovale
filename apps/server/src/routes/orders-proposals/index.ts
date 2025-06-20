import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

import { createClient } from '#database/index';
import { createRouter } from '#lib/create-app';
import { orders_proposals, users, items, chat_rooms, chat_messages, orders, orders_items, profiles } from '#db-schema';
import { authPath } from '#utils/constants';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { OrderProposalStatus, orderProposalStatusValues } from 'src/database/schemas/enumerated_values';
import { sendNewProposalMessage } from 'src/mailer/templates/order-proposal-received';
import { sendProposalAcceptedMessage } from 'src/mailer/templates/order-proposal-accepted';
import { sendProposalRejectedMessage } from 'src/mailer/templates/order-proposal-rejected';
import { create_order_proposal_schema, update_order_proposal_schema } from 'src/extended_schemas/order_proposals';

export const ordersProposalsRoute = createRouter()
	.post(`${authPath}/create`, authMiddleware, zValidator('json', create_order_proposal_schema), async (c) => {
		const { item_id, proposal_price, message } = c.req.valid('json');
		const user = c.var.user;

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				// get the profile id of the logged user
				const [profile] = await tx
					.select({ id: profiles.id })
					.from(profiles)
					.where(eq(profiles.user_id, user.id))
					.limit(1);

				if (!profile) return c.json({ error: 'Profile not found' }, 404);

				// check if the item exists and is available and published
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
					})
					.from(items)
					.where(and(eq(items.id, item_id), eq(items.status, 'available'), eq(items.published, true)))
					.limit(1);

				if (!item) return c.json({ error: 'Item not found' }, 404);

				// check if the user already has a proposal in pending status for this item
				const [proposalAlreadyExists] = await tx
					.select()
					.from(orders_proposals)
					.where(
						and(
							eq(orders_proposals.item_id, item_id),
							eq(orders_proposals.profile_id, profile.id),
							eq(orders_proposals.status, 'pending'),
						),
					)
					.limit(1);

				if (proposalAlreadyExists) return c.json({ error: 'Proposal already exists' }, 400);

				// create a new proposal
				const [proposal] = await tx
					.insert(orders_proposals)
					.values({
						item_id,
						profile_id: profile.id,
						proposal_price,
					})
					.returning();

				if (!proposal) return c.json({ error: 'Proposal not found' }, 404);

				// get the item owner email
				const [itemOwner] = await tx
					.select({ email: users.email })
					.from(profiles)
					.innerJoin(users, eq(profiles.user_id, users.id))
					.where(eq(profiles.id, item.profile_id))
					.limit(1);

				if (!itemOwner) return c.json({ error: 'Item owner not found' }, 404);

				// check if user already has an ongoing chat with the item owner
				const [chatRoom] = await tx
					.select()
					.from(chat_rooms)
					.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, profile.id)))
					.limit(1);

				let chatRoomId = null;

				if (chatRoom) {
					// send a new chat message of type proposal
					const [newChatMessage] = await tx
						.insert(chat_messages)
						.values({
							chat_room_id: chatRoom.id,
							sender_id: profile.id,
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
						.insert(chat_rooms)
						.values({
							item_id,
							buyer_id: profile.id,
						})
						.returning();

					if (!newChatRoom) return c.json({ error: 'Chat room not found' }, 404);

					// create a new chat message of type proposal
					const [newChatMessage] = await tx
						.insert(chat_messages)
						.values({
							chat_room_id: newChatRoom.id,
							sender_id: profile.id,
							order_proposal_id: proposal.id,
							message: message || `Proposal from ${user.username} for the object ${item.title}`,
							message_type: 'proposal',
						})
						.returning();

					if (!newChatMessage) return c.json({ error: 'Chat message not found' }, 404);

					chatRoomId = newChatRoom.id;
				}

				await sendNewProposalMessage({
					to: itemOwner.email,
					roomId: chatRoomId,
					buyer_username: user.username,
					itemName: item.title,
					message: message || `Proposal from ${user.username} for the object ${item.title}`,
				});

				return c.json({ proposal, chatRoomId }, 200);
			});
		} catch (error) {
			console.error('Error creating proposal:', error);
			return c.json({ error: 'Failed to create proposal' }, 500);
		}
	})
	.get(`${authPath}/:id`, authMiddleware, async (c) => {
		const id = Number(c.req.param('id'));

		const { db } = createClient();

		const proposal = await db
			.select({
				status: orders_proposals.status,
				proposal_price: orders_proposals.proposal_price,
				created_at: orders_proposals.created_at,
			})
			.from(orders_proposals)
			.where(eq(orders_proposals.id, id))
			.limit(1);

		if (!proposal[0]) return c.json({ error: 'Proposal not found' }, 404);

		return c.json(proposal[0], 200);
	})
	.get(
		`${authPath}/by_item/:item_id`,
		zValidator(
			'query',
			z.object({
				status: z.enum(orderProposalStatusValues).optional(),
			}),
		),
		authMiddleware,
		async (c) => {
			const user = c.var.user;
			const item_id = Number(c.req.param('item_id'));
			const { status } = c.req.valid('query');

			const { db } = createClient();

			const [proposal] = await db
				.select({
					id: orders_proposals.id,
					status: orders_proposals.status,
					created_at: orders_proposals.created_at,
				})
				.from(orders_proposals)
				.innerJoin(profiles, eq(orders_proposals.profile_id, profiles.id))
				.where(
					and(
						eq(orders_proposals.item_id, item_id),
						eq(orders_proposals.profile_id, profiles.id),
						eq(orders_proposals.status, status as OrderProposalStatus),
					),
				)
				.limit(1);

			if (!proposal) return c.json({ error: 'Proposal not found' }, 404);

			return c.json(proposal, 200);
		},
	)
	.put(`${authPath}`, authMiddleware, zValidator('json', update_order_proposal_schema), async (c) => {
		const user = c.var.user;

		const { id, status, item_id } = await c.req.valid('json');

		const { db } = createClient();

		// check if the item exists and is owned by the user (merchant)
		const [item] = await db
			.select({
				title: items.title,
				user_id: users.id,
			})
			.from(items)
			.innerJoin(profiles, eq(items.profile_id, profiles.id))
			.innerJoin(users, eq(profiles.user_id, users.id))
			.where(and(eq(items.id, item_id), eq(profiles.user_id, user.id)))
			.limit(1);

		if (!item) return c.json({ error: 'Item not found' }, 404);

		if (item.user_id !== user.id) return c.json({ error: 'Item not found' }, 404);

		// check if the proposal is not expired
		const [proposal] = await db
			.select()
			.from(orders_proposals)
			.where(and(eq(orders_proposals.id, id), eq(orders_proposals.status, 'expired')))
			.limit(1);

		if (proposal) return c.json({ error: 'Proposal expired' }, 400);

		const [updatedProposal] = await db
			.update(orders_proposals)
			.set({ status })
			.where(eq(orders_proposals.id, id))
			.returning();

		if (!updatedProposal) return c.json({ error: 'Proposal not found' }, 404);
		if (!updatedProposal.profile_id) return c.json({ error: 'Proposal profile not found' }, 404);

		// check if the proposal is not owned by the item owner
		if (user.id !== item.user_id) return c.json({ error: 'Proposal is not owned by the item owner' }, 404);

		// get the chat room
		const [chatRoom] = await db
			.select({ id: chat_rooms.id })
			.from(chat_rooms)
			.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, updatedProposal.profile_id)))
			.limit(1);

		if (!chatRoom) return c.json({ error: 'Chat room not found, cannot send the proposal update	 message' }, 404);

		const [userProposal] = await db
			.select({
				email: users.email,
				username: users.username,
			})
			.from(users)
			.where(eq(users.id, updatedProposal.profile_id))
			.limit(1);

		if (!userProposal) return c.json({ error: 'User not found' }, 404);

		if (status === 'accepted') {
			try {
				await db.transaction(async (tx) => {
					// create a new order and order item
					const [newOrder] = await tx
						.insert(orders)
						.values({
							buyer_id: updatedProposal.profile_id,
							seller_id: item.user_id,
						})
						.returning({
							id: orders.id,
						});

					if (!newOrder) throw new Error('Order not found');

					// create a new order item
					const [newOrderItem] = await tx
						.insert(orders_items)
						.values({
							order_id: newOrder.id,
							item_id,
							finished_price: updatedProposal.proposal_price,
							order_status: 'payment_pending',
						})
						.returning({
							id: orders_items.id,
						});

					if (!newOrderItem) throw new Error('Order item not found');

					sendProposalAcceptedMessage({
						to: userProposal.email,
						roomId: chatRoom.id,
						merchant_username: user.username,
						itemName: item.title,
					});

					return c.json(
						{
							message: 'Proposal accepted and order created successfully',
							order: {
								id: newOrder.id,
							},
						},
						200,
					);
				});
			} catch (error) {
				console.error('Error creating order:', error);
				return c.json({ error: 'Failed to create a new order' }, 500);
			}
		}

		if (status === 'rejected') {
			// reject the proposal
			await db.update(orders_proposals).set({ status: 'rejected' }).where(eq(orders_proposals.id, id));

			sendProposalRejectedMessage({
				to: userProposal.email,
				roomId: chatRoom.id,
				merchant_username: user.username,
				itemName: item.title,
			});

			return c.json(
				{
					message: 'Proposal rejected successfully',
				},
				200,
			);
		}

		return c.json(updatedProposal);
	});
