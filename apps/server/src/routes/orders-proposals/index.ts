import { eq, and } from 'drizzle-orm';
import { z } from 'zod/v4';
import { zValidator } from '@hono/zod-validator';

import { createClient } from '#database/index';
import { orders_proposals, users, items, chat_rooms, chat_messages, orders, profiles, addresses } from '#db-schema';
import { createRouter } from '#lib/create-app';
import { authPath } from '#utils/constants';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { OrderProposalStatus, orderProposalStatusValues } from 'src/database/schemas/enumerated_values';
import { sendNewProposalMessage } from 'src/mailer/templates/order-proposal-received';
import { sendProposalAcceptedMessage } from 'src/mailer/templates/order-proposal-accepted';
import { sendProposalRejectedMessage } from 'src/mailer/templates/order-proposal-rejected';
import {
	create_order_proposal_schema,
	seller_update_order_proposal_schema,
} from 'src/extended_schemas/order_proposals';
import { calculatePlatformCosts } from '#utils/platform-costs';
import { PaymentProviderService } from '../payments/payment-provider.service';

export const ordersProposalsRoute = createRouter()
	.post(`${authPath}/create`, authMiddleware, zValidator('json', create_order_proposal_schema), async (c) => {
		const user = c.var.user;

		const { item_id, proposal_price, message } = c.req.valid('json');

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				// Calculate all platforms costs
				const { shipping_price, payment_provider_charge, platform_charge } = await calculatePlatformCosts({
					item_id,
					price: proposal_price,
					buyer_profile_id: user.profile_id,
					buyer_email: user.email,
				});

				if (!shipping_price || !payment_provider_charge || !platform_charge) {
					return c.json({ error: 'Failed to calculate platforms costs' }, 500);
				}

				// check if the item exists and is available and published
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
						price: items.price,
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
							eq(orders_proposals.profile_id, user.profile_id),
							eq(orders_proposals.status, 'pending'),
						),
					)
					.limit(1);

				if (proposalAlreadyExists) return c.json({ error: 'Proposal already exists' }, 400);

				// Get more informations about the profile
				const [profile] = await tx
					.select({
						name: profiles.name,
						surname: profiles.surname,
						payment_provider_id: profiles.payment_provider_id,
						country_code: addresses.country_code,
					})
					.from(profiles)
					.innerJoin(addresses, and(eq(profiles.id, addresses.profile_id), eq(addresses.status, 'active')))
					.where(eq(profiles.id, user.profile_id));

				if (!profile) {
					throw new Error('User has no name or surname or payment_provider_id');
				}

				// Create a new payment provider guest user (buyer) if he has no payment_provider_id
				let buyerPaymentProviderId = profile.payment_provider_id;

				if (!buyerPaymentProviderId) {
					const paymentService = new PaymentProviderService();
					const guestUser = await paymentService.createGuestUser({
						id: user.id,
						email: user.email,
						first_name: profile.name,
						last_name: profile.surname,
						country_code: profile.country_code,
						tos_acceptance: {
							unix_timestamp: new Date().getTime() / 1000,
							ip_address: c.req.header('x-forwarded-for')?.split(',')[0] ?? 'IP non disponibile',
						},
					});

					if (!guestUser) {
						throw new Error('Failed to create buyer guest user');
					}

					// Update the profile with the payment provider ID
					await tx.update(profiles).set({ payment_provider_id: guestUser.id }).where(eq(profiles.id, user.profile_id));

					buyerPaymentProviderId = guestUser.id;
				}

				// create a new proposal
				const [proposal] = await tx
					.insert(orders_proposals)
					.values({
						item_id,
						profile_id: user.profile_id,
						proposal_price,
						shipping_price,
						payment_provider_charge,
						platform_charge,
						original_price: item.price,
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
					.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, user.profile_id)))
					.limit(1);

				let chatRoomId = null;

				if (chatRoom) {
					// send a new chat message of type proposal
					const [newChatMessage] = await tx
						.insert(chat_messages)
						.values({
							chat_room_id: chatRoom.id,
							sender_id: user.profile_id,
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
							buyer_id: user.profile_id,
						})
						.returning();

					if (!newChatRoom) return c.json({ error: 'Chat room not found' }, 404);

					// create a new chat message of type proposal
					const [newChatMessage] = await tx
						.insert(chat_messages)
						.values({
							chat_room_id: newChatRoom.id,
							sender_id: user.profile_id,
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
	.put(`${authPath}`, authMiddleware, zValidator('json', seller_update_order_proposal_schema), async (c) => {
		const user = c.var.user;

		const { id, status, item_id } = c.req.valid('json');

		// Input validation
		if (!id || !status || !item_id) {
			return c.json({ error: 'Missing required fields' }, 400);
		}

		// Validate that status is not expired or pending
		if (status === 'expired' || status === 'pending') {
			return c.json({ error: 'You cannot update a proposal to expired or pending status' }, 400);
		}

		// Validate that status is a valid enum value
		if (!['accepted', 'rejected'].includes(status)) {
			return c.json({ error: 'Invalid status value. Only "accepted" or "rejected" are allowed' }, 400);
		}

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				// Step 1: Validate item ownership and get item details
				// This query checks if the item exists and is owned by the current user
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
						user_id: users.id,
					})
					.from(items)
					.innerJoin(profiles, eq(items.profile_id, profiles.id))
					.innerJoin(users, eq(profiles.user_id, users.id))
					.where(and(eq(items.id, item_id), eq(profiles.user_id, user.id)))
					.limit(1);

				if (!item) {
					return c.json({ error: 'Item not found or you do not have permission to manage this item' }, 404);
				}

				// Step 2: Validate proposal exists and is in a modifiable state
				// Check if proposal exists and is not already in a final state
				const [existingProposal] = await tx
					.select({
						id: orders_proposals.id,
						status: orders_proposals.status,
						profile_id: orders_proposals.profile_id,
						proposal_price: orders_proposals.proposal_price,
						shipping_price: orders_proposals.shipping_price,
						platform_charge: orders_proposals.platform_charge,
					})
					.from(orders_proposals)
					.where(eq(orders_proposals.id, id))
					.limit(1);

				if (!existingProposal) {
					return c.json({ error: 'Proposal not found' }, 404);
				}

				// Check if proposal is already in a final state
				if (['expired', 'accepted', 'rejected'].includes(existingProposal.status)) {
					return c.json({ error: 'Proposal already accepted, rejected or expired' }, 400);
				}

				// Step 3: Get buyer information for notifications
				if (!existingProposal.profile_id) {
					return c.json({ error: 'Proposal profile not found' }, 404);
				}

				const [buyerInfo] = await tx
					.select({
						email: users.email,
						username: users.username,
					})
					.from(users)
					.innerJoin(profiles, eq(users.id, profiles.user_id))
					.where(eq(profiles.id, existingProposal.profile_id))
					.limit(1);

				if (!buyerInfo) {
					return c.json({ error: 'Buyer information not found' }, 404);
				}

				// Step 4: Get or create chat room for communication
				const [chatRoom] = await tx
					.select({ id: chat_rooms.id })
					.from(chat_rooms)
					.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, existingProposal.profile_id)))
					.limit(1);

				if (!chatRoom) {
					return c.json({ error: 'Chat room not found, cannot send the proposal update message' }, 404);
				}

				// Step 5: Update proposal status
				const [updatedProposal] = await tx
					.update(orders_proposals)
					.set({ status })
					.where(eq(orders_proposals.id, id))
					.returning();

				if (!updatedProposal) {
					return c.json({ error: 'Failed to update proposal' }, 500);
				}

				// Step 6: Handle different status updates
				if (status === 'accepted') {
					// Ensure that doesn't already exist an order for this item
					const [existingOrder] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(eq(orders.item_id, item_id))
						.limit(1);

					if (existingOrder) {
						return c.json({ error: 'An order already exists for this item' }, 400);
					}

					// Instantiate the payment provider service
					const paymentProviderService = new PaymentProviderService();

					// Total price to pay for the transaction
					const transactionPrice =
						existingProposal.proposal_price + existingProposal.shipping_price + existingProposal.platform_charge;

					// Calculate the payment provider charge based on the transactionPrice
					const { payment_provider_charge, payment_provider_charge_calculator_version } = await calculatePlatformCosts(
						{
							item_id,
							price: transactionPrice,
							buyer_profile_id: existingProposal.profile_id,
							buyer_email: buyerInfo.email,
						},
						{
							calculatePaymentProviderCharge: true,
							calculatePlatformCharge: false,
							calculateShipping: false,
						},
					);

					if (!payment_provider_charge || !payment_provider_charge_calculator_version) {
						return c.json({ error: 'Failed to calculate transaction fee' }, 500);
					}

					// Create a new payment transaction
					const transaction = await paymentProviderService.createTransaction({
						buyer_id: user.profile_id.toString(),
						seller_id: item.profile_id.toString(),
						creator_role: 'seller',
						currency: 'eur',
						description: `Payment for order ${id}`,
						price: transactionPrice,
						charge: payment_provider_charge,
						charge_calculator_version: payment_provider_charge_calculator_version,
					});

					if (!transaction) {
						return c.json({ error: 'Failed to create transaction' }, 500);
					}

					// Create new order when proposal is accepted
					const [newOrder] = await tx
						.insert(orders)
						.values({
							buyer_id: existingProposal.profile_id,
							seller_id: user.profile_id,
							total_price: existingProposal.proposal_price,
							shipping_price: existingProposal.shipping_price,
							payment_provider_charge,
							platform_charge: existingProposal.platform_charge,
							status: transaction.status,
							payment_transaction_id: transaction.id,
						})
						.returning({ id: orders.id });

					if (!newOrder) {
						throw new Error('Failed to create order');
					}

					// Send acceptance notification
					await sendProposalAcceptedMessage({
						to: buyerInfo.email,
						merchant_username: user.username,
						itemName: item.title,
					});

					return c.json(
						{
							message: 'Proposal accepted and order created successfully',
							order: { id: newOrder.id },
							proposal: updatedProposal,
						},
						200,
					);
				}

				if (status === 'rejected') {
					// Send rejection notification
					await sendProposalRejectedMessage({
						to: buyerInfo.email,
						roomId: chatRoom.id,
						merchant_username: user.username,
						itemName: item.title,
					});

					return c.json(
						{
							message: 'Proposal rejected successfully',
							proposal: updatedProposal,
						},
						200,
					);
				}

				// Return updated proposal for other status changes
				return c.json(
					{
						message: 'Proposal updated successfully',
						proposal: updatedProposal,
					},
					200,
				);
			});
		} catch (error) {
			console.error('Error updating proposal:', error);
			return c.json({ error: 'Failed to update proposal' }, 500);
		}
	});
