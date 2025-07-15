import { eq, and, count, or, inArray, not } from 'drizzle-orm';
import { z } from 'zod/v4';
import { zValidator } from '@hono/zod-validator';

import { createClient } from '#database/index';
import {
	orders_proposals,
	users,
	items,
	chat_rooms,
	chat_messages,
	orders,
	profiles,
	addresses,
	entityTrustapTransactions,
} from '#db-schema';
import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import {
	EntityTrustapTransactionStatus,
	itemStatus,
	ORDER_PROPOSAL_PHASES,
	OrderProposalStatus,
	orderProposalStatusValues,
	newOrderBlockedStates,
	ORDER_PHASES,
} from '#database/schemas/enumerated_values';
import { calculatePlatformCosts } from '#utils/platform-costs';
import { authPath } from '#utils/constants';
import { formatPriceToCents } from '#utils/price-formatter';
import { sendNewProposalMessageSeller } from '#mailer/templates/proposals/seller/proposal-received';
import { sendProposalAcceptedMessage } from '#mailer/templates/proposals/buyer/proposal-accepted';
import { sendProposalRejectedMessage } from '#mailer/templates/proposals/buyer/proposal-rejected';
import { sendProposalCancelledMessage } from '#mailer/templates/proposals/seller/proposal-buyer-cancelled';
import {
	create_order_proposal_schema,
	seller_update_order_proposal_schema,
	buyer_abort_proposal_schema,
} from '#extended_schemas';
import { PaymentProviderService } from '../payments/payment-provider.service';
import { ShipmentService } from '../shipment-provider/shipment.service';

export const ordersProposalsRoute = createRouter()
	// Buyer create a new proposal
	.post(`${authPath}/create`, authMiddleware, zValidator('json', create_order_proposal_schema), async (c) => {
		const user = c.var.user;

		const { item_id, proposal_price, shipping_label_id, message } = c.req.valid('json');

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				// Check if the item exists and is available and published
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
						price: items.price,
					})
					.from(items)
					.where(
						and(
							eq(items.id, item_id),
							eq(items.status, itemStatus.AVAILABLE),
							eq(items.published, true),
							// Proposal can't be sent if item owner is the seller
							not(eq(items.profile_id, user.profile_id)),
						),
					)
					.limit(1);

				if (!item) return c.json({ error: 'Item not found' }, 404);

				/* Check if the user already has an ongoing proposal for this item
				 * I'm getting the count of the "pending" proposals because I don't want to allow users to send multiple proposals in this state.
				 * While old proposals are in other states, the user is allowed to send a new proposal.
				 * Historically for the item - buyer, only a single proposal can exist in pending state.
				 */

				const blockedProposalStates = [ORDER_PROPOSAL_PHASES.pending];

				const [proposalCountResult] = await tx
					.select({ count: count() })
					.from(orders_proposals)
					.where(
						and(
							eq(orders_proposals.item_id, item_id),
							eq(orders_proposals.profile_id, user.profile_id),
							inArray(orders_proposals.status, blockedProposalStates),
						),
					);

				const proposalCount = proposalCountResult?.count || 0;

				if (proposalCount > 0) {
					return c.json({ error: 'You already have an ongoing proposal for this item' }, 400);
				}

				/* Protection against multiple orders for the same item in specific states.
				 * This prevents the user from sending multiple proposals when they already have an ongoing order.
				 */

				const [orderCountResult] = await tx
					.select({ count: count() })
					.from(orders)
					.where(
						and(
							eq(orders.item_id, item_id),
							eq(orders.buyer_id, user.profile_id),
							inArray(orders.status, newOrderBlockedStates),
						),
					);

				const orderCount = orderCountResult?.count || 0;

				if (orderCount > 0) return c.json({ error: 'You already have an active order for this item' }, 400);

				// Retrieve shipment label from shippo
				const shipmentService = new ShipmentService();
				const shippingLabel = await shipmentService.getShippingLabel(shipping_label_id);
				const shipping_price = shippingLabel.rates?.[0]?.amount
					? formatPriceToCents(parseFloat(shippingLabel.rates[0].amount))
					: 0;

				// Calculate platform charge amount
				const { platform_charge_amount } = await calculatePlatformCosts(
					{ price: proposal_price },
					{ platform_charge_amount: true },
				);

				if (!platform_charge_amount) {
					throw new Error('Failed to calculate platform charge amount');
				}

				// Calculate payment provider charge with the total amount (including platform charge)
				const transactionPreviewPrice = proposal_price + platform_charge_amount;

				const { payment_provider_charge } = await calculatePlatformCosts(
					{ price: transactionPreviewPrice, postage_fee: shipping_price },
					{ payment_provider_charge: true },
				);

				if (!shipping_price || !payment_provider_charge) {
					throw new Error('Failed to calculate shipping price or payment provider charge');
				}

				// Get more informations about the buyer profile
				const [buyerInfo] = await tx
					.select({
						name: profiles.name,
						surname: profiles.surname,
						payment_provider_id: profiles.payment_provider_id,
						country_code: addresses.country_code,
					})
					.from(profiles)
					.innerJoin(addresses, and(eq(profiles.id, addresses.profile_id), eq(addresses.status, 'active')))
					.where(eq(profiles.id, user.profile_id));

				if (!buyerInfo) {
					throw new Error('User has no name or surname or payment_provider_id');
				}

				let buyerPaymentProviderId = buyerInfo.payment_provider_id;

				// Create a new payment provider guest user (buyer) if he has no payment_provider_id
				if (!buyerPaymentProviderId) {
					const paymentService = new PaymentProviderService();
					const guestUser = await paymentService.createGuestUser({
						id: user.id,
						email: user.email,
						first_name: buyerInfo.name,
						last_name: buyerInfo.surname,
						country_code: buyerInfo.country_code,
						tos_acceptance: {
							unix_timestamp: Math.floor(new Date().getTime() / 1000),
							ip: c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1',
						},
					});

					if (!guestUser) {
						throw new Error('Failed to create buyer guest user');
					}

					// Update the profile with the payment provider ID
					await tx.update(profiles).set({ payment_provider_id: guestUser.id }).where(eq(profiles.id, user.profile_id));

					buyerPaymentProviderId = guestUser.id;
				}

				// Create a new proposal with default status (pending)
				const [proposal] = await tx
					.insert(orders_proposals)
					.values({
						item_id,
						profile_id: user.profile_id,
						proposal_price,
						payment_provider_charge,
						platform_charge: platform_charge_amount,
						shipping_label_id,
						original_price: item.price,
					})
					.returning();

				if (!proposal) return c.json({ error: 'Proposal not found' }, 404);

				// Get the Seller (item owner) email
				const [itemOwner] = await tx
					.select({ email: users.email })
					.from(profiles)
					.innerJoin(users, eq(profiles.user_id, item.profile_id))
					.where(eq(profiles.id, item.profile_id))
					.limit(1);

				if (!itemOwner) return c.json({ error: 'Item owner not found' }, 404);

				// Check if user already has an ongoing chat with the seller for this item
				const [chatRoom] = await tx
					.select()
					.from(chat_rooms)
					.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, user.profile_id)))
					.limit(1);

				let chatRoomId = null;

				if (chatRoom) {
					// Send a new chat message of type proposal
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
					// Create a new chat room
					const [newChatRoom] = await tx
						.insert(chat_rooms)
						.values({
							item_id,
							buyer_id: user.profile_id,
						})
						.returning();

					if (!newChatRoom) return c.json({ error: 'Chat room not found' }, 404);

					// Create a new chat message of type proposal
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

				// send email to the seller
				await sendNewProposalMessageSeller({
					to: itemOwner.email,
					roomId: chatRoomId,
					buyer_username: user.username,
					itemName: item.title,
					message,
				});

				return c.json({ proposal, chatRoomId }, 200);
			});
		} catch (error) {
			console.error('Error creating proposal:', error);
			return c.json({ error: 'Failed to create proposal' }, 500);
		}
	})
	// Seller update proposal status, only accepted or rejected
	.put(`${authPath}`, authMiddleware, zValidator('json', seller_update_order_proposal_schema), async (c) => {
		const user = c.var.user;

		const { id, status, item_id } = c.req.valid('json');

		// Input validation
		if (!id || !status || !item_id) return c.json({ error: 'Missing required fields' }, 400);

		const { pending, accepted, rejected } = ORDER_PROPOSAL_PHASES;

		// Validate that status is a valid enum value
		if (![accepted, rejected].includes(status)) {
			return c.json({ error: 'Invalid status value. Only "accepted" or "rejected" are allowed' }, 400);
		}

		const { db } = createClient();

		try {
			return await db.transaction(async (tx) => {
				// 1. Check if the item exists and is owned by the current user
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
						user_id: users.id,
						payment_provider_id: profiles.payment_provider_id,
						address_id: addresses.id,
					})
					.from(items)
					.innerJoin(profiles, eq(items.profile_id, profiles.id))
					.innerJoin(users, eq(profiles.user_id, users.id))
					.innerJoin(addresses, and(eq(profiles.id, addresses.profile_id), eq(addresses.status, 'active')))
					.where(
						and(
							eq(items.id, item_id),
							eq(items.profile_id, user.profile_id),
							eq(items.status, itemStatus.AVAILABLE),
							eq(items.published, true),
						),
					)
					.limit(1);

				if (!item) {
					return c.json({ error: 'Seller has no item or you do not have permission to manage this item' }, 404);
				}

				if (!item.payment_provider_id) return c.json({ error: 'Seller has no payment provider id' }, 404);

				// 2. Check if proposal exists and is in "pending" state
				const [existingProposal] = await tx
					.select({
						id: orders_proposals.id,
						status: orders_proposals.status,
						profile_id: orders_proposals.profile_id,
						proposal_price: orders_proposals.proposal_price,
						platform_charge: orders_proposals.platform_charge,
						shipping_label_id: orders_proposals.shipping_label_id,
					})
					.from(orders_proposals)
					.where(and(eq(orders_proposals.id, id), eq(orders_proposals.status, pending)))
					.limit(1);

				if (!existingProposal) return c.json({ error: 'Proposal not found' }, 404);

				const buyerProfileId = Number(existingProposal.profile_id);

				// 3. Get buyer information
				const [buyerInfo] = await tx
					.select({
						email: users.email,
						username: users.username,
						payment_provider_id: profiles.payment_provider_id,
						address_id: addresses.id,
					})
					.from(users)
					.innerJoin(profiles, eq(users.id, profiles.user_id))
					.innerJoin(addresses, and(eq(profiles.id, addresses.profile_id), eq(addresses.status, 'active')))
					.where(eq(profiles.id, buyerProfileId))
					.limit(1);

				if (!buyerInfo || !buyerInfo.payment_provider_id) {
					return c.json({ error: 'Buyer information not found or buyer has no payment provider id' }, 404);
				}

				// 4: Get the chat room
				const [chatRoom] = await tx
					.select({ id: chat_rooms.id })
					.from(chat_rooms)
					.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, buyerProfileId)))
					.limit(1);

				if (!chatRoom) return c.json({ error: 'Chat room not found' }, 404);

				let order_response: {
					id?: number;
				} | null = null;

				let transaction_response: {
					id?: number;
					status?: string;
				} | null = null;

				// 5: Handle different status updates
				if (status === rejected) {
					// Create a new chat message of type system
					const [newChatMessage] = await tx
						.insert(chat_messages)
						.values({
							chat_room_id: chatRoom.id,
							sender_id: user.profile_id,
							message: `Proposal #${existingProposal.id}, has been rejected by the seller.`,
							message_type: 'system',
							metadata: {
								type: 'proposal_rejected',
							},
						})
						.returning();

					if (!newChatMessage) return c.json({ error: 'Chat message not found' }, 404);

					// Send rejection notification
					await sendProposalRejectedMessage({
						to: buyerInfo.email,
						roomId: chatRoom.id,
						merchant_username: user.username,
						itemName: item.title,
					});
				} else {
					// Get the shipping label id from the proposal
					const shipmentService = new ShipmentService();
					const shippingLabel = await shipmentService.getShippingLabel(existingProposal.shipping_label_id);
					const shipping_price = shippingLabel.rates?.[0]?.amount
						? formatPriceToCents(parseFloat(shippingLabel.rates[0].amount))
						: 0;

					// Total price to pay for the transaction
					const transactionPrice = existingProposal.proposal_price + existingProposal.platform_charge;

					// Calculate the payment provider charge based on the transactionPrice
					const { payment_provider_charge, payment_provider_charge_calculator_version } = await calculatePlatformCosts(
						{
							price: transactionPrice,
							postage_fee: shipping_price,
						},
						{
							payment_provider_charge: true,
						},
					);

					if (!payment_provider_charge || !payment_provider_charge_calculator_version) {
						return c.json({ error: 'Failed to calculate transaction fee' }, 500);
					}

					// Instantiate the payment provider service
					const paymentProviderService = new PaymentProviderService();

					// Create a new payment transaction
					const transaction = await paymentProviderService.createTransactionWithBothUsers({
						buyer_id: buyerInfo.payment_provider_id,
						seller_id: item.payment_provider_id,
						creator_role: 'seller',
						currency: 'eur',
						description: `Transaction for ${item.title} - (Proposal #${existingProposal.id})`,
						price: transactionPrice,
						postage_fee: shipping_price,
						charge: payment_provider_charge,
						charge_calculator_version: payment_provider_charge_calculator_version,
					});

					if (!transaction) return c.json({ error: 'Failed to create transaction' }, 500);

					// Store Trustap transaction details for tracking
					const [trustapTransaction] = await tx
						.insert(entityTrustapTransactions)
						.values({
							entityId: item_id,
							sellerId: transaction.seller_id,
							buyerId: transaction.buyer_id,
							transactionId: transaction.id,
							transactionType: 'online_payment',
							status: transaction.status as EntityTrustapTransactionStatus,
							price: transactionPrice,
							charge: payment_provider_charge,
							chargeSeller: transaction.charge_seller || 0,
							currency: 'eur',
							entityTitle: item.title,
							claimedBySeller: false,
							claimedByBuyer: false,
							complaintPeriodDeadline: null, // Will be set by webhook
						})
						.returning();

					if (!trustapTransaction) throw new Error('Failed to store Trustap transaction details');

					// Create a temporary new order when proposal is accepted
					const [newOrder] = await tx
						.insert(orders)
						.values({
							item_id,
							buyer_id: buyerProfileId,
							buyer_address: buyerInfo.address_id,
							seller_id: user.profile_id,
							seller_address: item.address_id,
							shipping_price,
							payment_provider_charge,
							platform_charge: existingProposal.platform_charge,
							payment_transaction_id: transaction.id,
							shipping_label_id: existingProposal.shipping_label_id,
							proposal_id: existingProposal.id,
						})
						.returning({ id: orders.id });

					if (!newOrder) throw new Error('Failed to create order');

					transaction_response = {
						id: transaction.id,
						status: transaction.status,
					};

					order_response = {
						id: newOrder.id,
					};

					// Create a new chat message of type system
					const [newChatMessage] = await tx
						.insert(chat_messages)
						.values({
							chat_room_id: chatRoom.id,
							sender_id: user.profile_id,
							message: `Proposal #${existingProposal.id}, has been accepted by the seller.`,
							message_type: 'system',
							metadata: {
								order_id: newOrder.id,
								type: 'proposal_accepted',
							},
						})
						.returning();

					if (!newChatMessage) return c.json({ error: 'Chat message not found' }, 404);

					// Send acceptance notification
					await sendProposalAcceptedMessage({
						to: buyerInfo.email,
						merchant_username: user.username,
						itemName: item.title,
					});
				}

				// Update proposal status (accepted or rejected)
				const [updatedProposal] = await tx
					.update(orders_proposals)
					.set({ status })
					.where(eq(orders_proposals.id, id))
					.returning();

				if (!updatedProposal) return c.json({ error: 'Failed to update proposal' }, 500);

				// Return updated proposal for other status changes
				return c.json(
					{
						message: 'Proposal updated successfully',
						proposal: updatedProposal,
						...(status === accepted && {
							order: order_response,
							transaction: transaction_response,
						}),
					},
					200,
				);
			});
		} catch (error) {
			console.error('Error updating proposal:', error);
			return c.json({ error: 'Failed to update proposal' }, 500);
		}
	})
	// Buyer abort a proposal
	.post(
		`${authPath}/buyer_aborted_proposal`,
		authMiddleware,
		zValidator('json', buyer_abort_proposal_schema),
		async (c) => {
			const user = c.var.user;

			const { proposal_id } = c.req.valid('json');

			const { db } = createClient();

			try {
				return await db.transaction(async (tx) => {
					// Check if the proposal exists, is in "pending" state and is owned by the buyer
					const [existingProposal] = await tx
						.select({
							id: orders_proposals.id,
							status: orders_proposals.status,
							item_id: orders_proposals.item_id,
							profile_id: orders_proposals.profile_id,
							item_title: items.title,
							selelr_email: users.email,
						})
						.from(orders_proposals)
						.innerJoin(items, eq(orders_proposals.item_id, items.id))
						.innerJoin(profiles, eq(items.profile_id, profiles.id))
						.innerJoin(users, eq(profiles.user_id, users.id))
						.where(
							and(
								eq(orders_proposals.profile_id, user.profile_id),
								eq(orders_proposals.id, proposal_id),
								eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
								eq(items.status, itemStatus.AVAILABLE),
								eq(items.published, true),
							),
						)
						.limit(1);

					if (!existingProposal || !existingProposal.item_id) return c.json({ error: 'Proposal not found' }, 404);

					// proposal is owned by the buyer
					if (existingProposal.profile_id !== user.profile_id) return c.json({ error: 'Proposal not found' }, 404);

					// Update proposal status to "buyer_aborted"
					const [updatedProposal] = await tx
						.update(orders_proposals)
						.set({ status: ORDER_PROPOSAL_PHASES.buyer_aborted })
						.where(eq(orders_proposals.id, proposal_id))
						.returning();

					if (!updatedProposal) return c.json({ error: 'Failed to update proposal' }, 500);

					// Cancel the order connected to the proposal
					const [updatedOrder] = await tx
						.update(orders)
						.set({ status: ORDER_PHASES.CANCELLED })
						.where(eq(orders.proposal_id, proposal_id))
						.returning();

					if (!updatedOrder) return c.json({ error: 'Failed to cancel order' }, 500);

					// Get the chat room
					const [chatRoom] = await tx
						.select({ id: chat_rooms.id })
						.from(chat_rooms)
						.where(and(eq(chat_rooms.item_id, existingProposal.item_id), eq(chat_rooms.buyer_id, user.profile_id)))
						.limit(1);

					if (!chatRoom) return c.json({ error: 'Chat room not found' }, 404);

					const [newChatMessage] = await tx
						.insert(chat_messages)
						.values({
							chat_room_id: chatRoom.id,
							sender_id: user.profile_id,
							message: `${user.username} has aborted the proposal #${existingProposal.id}.`,
							message_type: 'system',
							metadata: {
								type: 'proposal_buyer_aborted',
							},
						})
						.returning();

					if (!newChatMessage) return c.json({ error: 'Chat message not found' }, 404);

					// Send to seller the cancelled proposal notification
					await sendProposalCancelledMessage({
						to: existingProposal.selelr_email,
						proposal_id,
						buyer_username: user.username,
						itemName: existingProposal.item_title,
					});

					return c.json({ message: 'Proposal aborted successfully' }, 200);
				});
			} catch (error) {
				console.error('Error aborting proposal:', error);
				return c.json({ error: 'Failed to abort proposal' }, 500);
			}
		},
	)
	// Get a proposal by id (for the chat)
	.get(`${authPath}/:id`, authMiddleware, async (c) => {
		const id = Number(c.req.param('id'));

		const { db } = createClient();

		const proposal = await db
			.select({
				id: orders_proposals.id,
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
	// Check if an item has a proposal
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
	);
