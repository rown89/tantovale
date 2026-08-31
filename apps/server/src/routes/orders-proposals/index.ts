import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod/v4';
import { zValidator } from '@hono/zod-validator';

import { createClient } from '#database/index';
import {
	addressStatus,
	EntityTrustapTransactionStatus,
	itemStatus,
	newOrderBlockedStates,
	ORDER_PROPOSAL_PHASES,
	OrderProposalStatus,
	orderProposalStatusValues,
} from '#database/schemas/enumerated_values';
import {
	addresses,
	categories,
	chat_messages,
	chat_rooms,
	entityTrustapTransactions,
	items,
	orders,
	orders_proposals,
	profiles,
	subcategories,
	users,
} from '#db-schema';
import {
	buyer_abort_proposal_schema,
	create_order_proposal_schema,
	seller_update_order_proposal_schema,
} from '#extended_schemas';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';
import { acquirePaymentProviderIdentityLock } from '#lib/payment-provider-identity-lock';
import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { sendProposalAcceptedMessage } from '#mailer/templates/proposals/buyer/proposal-accepted';
import { sendProposalRejectedMessage } from '#mailer/templates/proposals/buyer/proposal-rejected';
import { sendProposalCancelledMessage } from '#mailer/templates/proposals/seller/proposal-buyer-cancelled';
import { sendNewProposalMessageSeller } from '#mailer/templates/proposals/seller/proposal-received';
import { authPath } from '#utils/constants';
import { formatPriceToCents } from '#utils/price-formatter';
import { calculatePlatformCosts } from '#utils/platform-costs';

import { PaymentProviderHttpError, PaymentProviderService } from '../payments/payment-provider.service';
import { ShipmentService } from '../shipment-provider/shipment.service';

const postgresIntegerMax = 2_147_483_647;

function parseResourceId(value: string): number | undefined {
	if (!/^[1-9]\d*$/.test(value)) return undefined;
	const id = Number(value);
	return Number.isSafeInteger(id) && id <= postgresIntegerMax ? id : undefined;
}

function toPositiveCents(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const decimal = Number(value);
	if (!Number.isFinite(decimal) || decimal <= 0) return undefined;
	const cents = formatPriceToCents(decimal);
	return Number.isSafeInteger(cents) && cents > 0 && cents <= postgresIntegerMax ? cents : undefined;
}

async function bestEffortEmail(send: () => Promise<unknown>): Promise<void> {
	try {
		await send();
	} catch (error) {
		console.error('Failed to send proposal notification:', error);
	}
}

export const ordersProposalsRoute = createRouter()
	.post(`${authPath}/create`, authMiddleware, zValidator('json', create_order_proposal_schema), async (c) => {
		const user = c.var.user;
		const { item_id, proposal_price, shipping_label_id, message } = c.req.valid('json');
		const { db } = createClient();

		try {
			const result = await db.transaction(async (tx) => {
				await acquireItemCommerceLock(tx, item_id);
				const [item] = await tx
					.select({
						id: items.id,
						title: items.title,
						profile_id: items.profile_id,
						price: items.price,
						seller_email: users.email,
					})
					.from(items)
					.innerJoin(profiles, eq(items.profile_id, profiles.id))
					.innerJoin(users, eq(profiles.user_id, users.id))
					.innerJoin(subcategories, eq(items.subcategory_id, subcategories.id))
					.innerJoin(categories, eq(subcategories.category_id, categories.id))
					.where(
						and(
							eq(items.id, item_id),
							eq(items.status, itemStatus.AVAILABLE),
							eq(items.published, true),
							eq(items.easy_pay, true),
							isNull(items.deleted_at),
							eq(subcategories.published, true),
							eq(categories.published, true),
						),
					)
					.limit(1);
				if (!item) return { error: 'Item not found', status: 404 as const };
				if (item.profile_id === user.profile_id) {
					return { error: 'You cannot make a proposal for your own item', status: 400 as const };
				}
				if (proposal_price >= item.price) {
					return { error: 'Proposal price must be lower than the item price', status: 400 as const };
				}

				const [pendingProposal] = await tx
					.select({ id: orders_proposals.id })
					.from(orders_proposals)
					.where(
						and(
							eq(orders_proposals.item_id, item_id),
							eq(orders_proposals.profile_id, user.profile_id),
							eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
						),
					)
					.limit(1);
				if (pendingProposal) {
					return { error: 'You already have an ongoing proposal for this item', status: 400 as const };
				}

				const [activeOrder] = await tx
					.select({ id: orders.id })
					.from(orders)
					.where(and(eq(orders.item_id, item_id), inArray(orders.status, newOrderBlockedStates)))
					.limit(1);
				if (activeOrder) return { error: 'An active order already exists for this item', status: 400 as const };

				await acquirePaymentProviderIdentityLock(tx, user.profile_id);
				const [buyer] = await tx
					.select({
						name: profiles.name,
						surname: profiles.surname,
						payment_provider_id: profiles.payment_provider_id,
						country_code: addresses.country_code,
					})
					.from(profiles)
					.innerJoin(addresses, and(eq(addresses.profile_id, profiles.id), eq(addresses.status, addressStatus.ACTIVE)))
					.where(eq(profiles.id, user.profile_id))
					.limit(1);
				if (!buyer) return { error: 'Buyer information not found', status: 404 as const };

				if (!buyer.payment_provider_id) {
					const guest = await new PaymentProviderService().createGuestUser({
						id: user.profile_id,
						email: user.email,
						first_name: buyer.name,
						last_name: buyer.surname,
						country_code: buyer.country_code,
						tos_acceptance: {
							unix_timestamp: Math.floor(Date.now() / 1_000),
							ip: c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1',
						},
					});
					await tx
						.update(profiles)
						.set({ payment_provider_id: guest.id })
						.where(and(eq(profiles.id, user.profile_id), isNull(profiles.payment_provider_id)));
				}

				const shipment = await new ShipmentService().getShippingLabel(shipping_label_id);
				const shippingPrice = toPositiveCents(shipment.rates?.[0]?.amount);
				if (!shippingPrice) throw new Error('Failed to calculate shipping price');
				const { platform_charge_amount: platformCharge } = await calculatePlatformCosts(
					{ price: proposal_price },
					{ platform_charge_amount: true },
				);
				if (platformCharge === undefined) throw new Error('Failed to calculate platform charge amount');
				const transactionPrice = proposal_price + platformCharge;
				if (!Number.isSafeInteger(transactionPrice) || transactionPrice > postgresIntegerMax) {
					return { error: 'Proposal price exceeds the supported range', status: 400 as const };
				}
				const { payment_provider_charge: paymentProviderCharge } = await calculatePlatformCosts(
					{ price: transactionPrice, postage_fee: shippingPrice },
					{ payment_provider_charge: true },
				);
				if (paymentProviderCharge === undefined) throw new Error('Failed to calculate payment provider charge');

				const [proposal] = await tx
					.insert(orders_proposals)
					.values({
						item_id,
						profile_id: user.profile_id,
						proposal_price,
						payment_provider_charge: paymentProviderCharge,
						platform_charge: platformCharge,
						shipping_label_id,
						original_price: item.price,
					})
					.returning();
				if (!proposal) throw new Error('Failed to create proposal');

				let [room] = await tx
					.select({ id: chat_rooms.id })
					.from(chat_rooms)
					.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, user.profile_id)))
					.limit(1);
				if (!room) {
					const [createdRoom] = await tx
						.insert(chat_rooms)
						.values({ item_id, buyer_id: user.profile_id })
						.onConflictDoNothing()
						.returning({ id: chat_rooms.id });
					room =
						createdRoom ??
						(
							await tx
								.select({ id: chat_rooms.id })
								.from(chat_rooms)
								.where(and(eq(chat_rooms.item_id, item_id), eq(chat_rooms.buyer_id, user.profile_id)))
								.limit(1)
						)[0];
				}
				if (!room) throw new Error('Failed to create chat room');

				await tx.insert(chat_messages).values({
					chat_room_id: room.id,
					sender_id: user.profile_id,
					order_proposal_id: proposal.id,
					message: message || `Proposal from ${user.username} for the object ${item.title}`,
					message_type: 'proposal',
				});

				return {
					proposal,
					chatRoomId: room.id,
					mail: {
						to: item.seller_email,
						buyer_username: user.username,
						itemName: item.title,
						message,
					},
				};
			});

			if ('error' in result) return c.json({ error: result.error }, result.status);
			await bestEffortEmail(() => sendNewProposalMessageSeller({ ...result.mail, roomId: result.chatRoomId }));
			return c.json({ proposal: result.proposal, chatRoomId: result.chatRoomId }, 200);
		} catch (error) {
			console.error('Error creating proposal:', error);
			return c.json({ error: 'Failed to create proposal' }, 500);
		}
	})
	.put(`${authPath}`, authMiddleware, zValidator('json', seller_update_order_proposal_schema), async (c) => {
		const user = c.var.user;
		const { id, status, item_id } = c.req.valid('json');
		const { db } = createClient();

		try {
			const result = await db.transaction(async (tx) => {
				await acquireItemCommerceLock(tx, item_id);
				const [resource] = await tx
					.select({
						item_id: items.id,
						item_title: items.title,
						seller_address: items.address_id,
						seller_provider_id: profiles.payment_provider_id,
						proposal_id: orders_proposals.id,
						buyer_profile_id: orders_proposals.profile_id,
						proposal_price: orders_proposals.proposal_price,
						platform_charge: orders_proposals.platform_charge,
						shipping_label_id: orders_proposals.shipping_label_id,
					})
					.from(orders_proposals)
					.innerJoin(items, eq(orders_proposals.item_id, items.id))
					.innerJoin(profiles, eq(items.profile_id, profiles.id))
					.where(
						and(
							eq(orders_proposals.id, id),
							eq(orders_proposals.item_id, item_id),
							eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
							eq(items.profile_id, user.profile_id),
							isNull(items.deleted_at),
						),
					)
					.limit(1);
				if (
					!resource ||
					resource.item_id === null ||
					resource.buyer_profile_id === null ||
					resource.seller_address === null
				) {
					return { error: 'Proposal not found', status: 404 as const };
				}
				const resourceItemId = resource.item_id;
				const buyerProfileId = resource.buyer_profile_id;
				const sellerAddressId = resource.seller_address;

				const [buyer] = await tx
					.select({
						email: users.email,
						payment_provider_id: profiles.payment_provider_id,
						address_id: addresses.id,
					})
					.from(profiles)
					.innerJoin(users, eq(profiles.user_id, users.id))
					.innerJoin(addresses, and(eq(addresses.profile_id, profiles.id), eq(addresses.status, addressStatus.ACTIVE)))
					.where(eq(profiles.id, buyerProfileId))
					.limit(1);
				if (!buyer) return { error: 'Buyer information not found', status: 404 as const };

				const [chatRoom] = await tx
					.select({ id: chat_rooms.id })
					.from(chat_rooms)
					.where(and(eq(chat_rooms.item_id, resourceItemId), eq(chat_rooms.buyer_id, buyerProfileId)))
					.limit(1);
				if (!chatRoom) return { error: 'Chat room not found', status: 404 as const };
				const [activeOrder] = await tx
					.select({ id: orders.id })
					.from(orders)
					.where(and(eq(orders.item_id, item_id), inArray(orders.status, newOrderBlockedStates)))
					.limit(1);
				if (activeOrder) return { error: 'An active order already exists for this item', status: 400 as const };

				if (status === ORDER_PROPOSAL_PHASES.accepted) {
					if (!resource.seller_provider_id || !buyer.payment_provider_id) {
						return { error: 'Payment provider identity not found', status: 404 as const };
					}
					const [sellerAddress] = await tx
						.select({ id: addresses.id })
						.from(addresses)
						.where(
							and(
								eq(addresses.id, sellerAddressId),
								eq(addresses.profile_id, user.profile_id),
								eq(addresses.status, addressStatus.ACTIVE),
							),
						)
						.limit(1);
					if (!sellerAddress) return { error: 'Seller address not found', status: 404 as const };
					const shipment = await new ShipmentService().getShippingLabel(resource.shipping_label_id);
					const shippingPrice = toPositiveCents(shipment.rates?.[0]?.amount);
					if (!shippingPrice) throw new Error('Failed to calculate shipping price');
					const transactionPrice = resource.proposal_price + resource.platform_charge;
					if (!Number.isSafeInteger(transactionPrice) || transactionPrice > postgresIntegerMax) {
						return { error: 'Proposal price exceeds the supported range', status: 400 as const };
					}
					const {
						payment_provider_charge: paymentProviderCharge,
						payment_provider_charge_calculator_version: calculatorVersion,
					} = await calculatePlatformCosts(
						{ price: transactionPrice, postage_fee: shippingPrice },
						{ payment_provider_charge: true },
					);
					if (paymentProviderCharge === undefined || calculatorVersion === undefined) {
						throw new Error('Failed to calculate transaction fee');
					}
					const [reservedOrder] = await tx
						.insert(orders)
						.values({
							item_id,
							buyer_id: buyerProfileId,
							seller_id: user.profile_id,
							buyer_address: buyer.address_id,
							seller_address: sellerAddress.id,
							shipping_price: shippingPrice,
							payment_provider_charge: paymentProviderCharge,
							platform_charge: resource.platform_charge,
							shipping_label_id: resource.shipping_label_id,
						})
						.returning({ id: orders.id });
					if (!reservedOrder) throw new Error('Failed to reserve order');
					return {
						kind: 'accept-reserved' as const,
						reservationId: reservedOrder.id,
						buyerProviderId: buyer.payment_provider_id,
						sellerProviderId: resource.seller_provider_id,
						transactionPrice,
						shippingPrice,
						paymentProviderCharge,
						calculatorVersion,
						chatRoomId: chatRoom.id,
						itemTitle: resource.item_title,
						mail: { to: buyer.email, roomId: chatRoom.id, itemName: resource.item_title },
					};
				}

				const [updatedProposal] = await tx
					.update(orders_proposals)
					.set({ status: ORDER_PROPOSAL_PHASES.rejected, updated_at: new Date() })
					.where(
						and(
							eq(orders_proposals.id, id),
							eq(orders_proposals.item_id, item_id),
							eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
						),
					)
					.returning();
				if (!updatedProposal) throw new Error('Failed to update proposal');
				await tx.insert(chat_messages).values({
					chat_room_id: chatRoom.id,
					sender_id: user.profile_id,
					message: `Proposal #${resource.proposal_id}, has been rejected by the seller.`,
					message_type: 'system',
					metadata: { type: 'proposal_rejected' },
				});

				return {
					kind: 'rejected' as const,
					updatedProposal,
					mail: { to: buyer.email, roomId: chatRoom.id, itemName: resource.item_title },
				};
			});

			if ('error' in result) return c.json({ error: result.error }, result.status);
			if (result.kind === 'accept-reserved') {
				let transaction: Awaited<ReturnType<PaymentProviderService['createTransactionWithBothUsers']>>;
				try {
					transaction = await new PaymentProviderService().createTransactionWithBothUsers({
						buyer_id: result.buyerProviderId,
						seller_id: result.sellerProviderId,
						creator_role: 'seller',
						currency: 'eur',
						description: `Transaction for ${result.itemTitle} - (Proposal #${id})`,
						price: result.transactionPrice,
						postage_fee: result.shippingPrice,
						charge: result.paymentProviderCharge,
						charge_calculator_version: result.calculatorVersion,
					});
					if (!transaction) throw new Error('Failed to create transaction');
				} catch (providerError) {
					if (providerError instanceof PaymentProviderHttpError) {
						await db.transaction(async (tx) => {
							await acquireItemCommerceLock(tx, item_id);
							await tx
								.delete(orders)
								.where(
									and(
										eq(orders.id, result.reservationId),
										eq(orders.item_id, item_id),
										isNull(orders.payment_transaction_id),
									),
								);
						});
					}
					throw providerError;
				}

				const accepted = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, item_id);
					const [pendingProposal] = await tx
						.select({ id: orders_proposals.id })
						.from(orders_proposals)
						.innerJoin(items, eq(orders_proposals.item_id, items.id))
						.where(
							and(
								eq(orders_proposals.id, id),
								eq(orders_proposals.item_id, item_id),
								eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
								eq(items.profile_id, user.profile_id),
							),
						)
						.limit(1);
					if (!pendingProposal) throw new Error('Pending proposal not found during finalization');
					const [reservedOrder] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(
							and(
								eq(orders.id, result.reservationId),
								eq(orders.item_id, item_id),
								isNull(orders.payment_transaction_id),
							),
						)
						.limit(1);
					if (!reservedOrder) throw new Error('Order reservation not found during finalization');
					await tx.insert(entityTrustapTransactions).values({
						entityId: item_id,
						sellerId: transaction.seller_id,
						buyerId: transaction.buyer_id,
						transactionId: transaction.id,
						transactionType: 'online_payment',
						status: transaction.status as EntityTrustapTransactionStatus,
						price: result.transactionPrice,
						charge: result.paymentProviderCharge,
						chargeSeller: transaction.charge_seller || 0,
						currency: 'eur',
						entityTitle: result.itemTitle,
						claimedBySeller: false,
						claimedByBuyer: false,
						complaintPeriodDeadline: null,
					});
					const [updatedOrder] = await tx
						.update(orders)
						.set({ payment_transaction_id: transaction.id, updated_at: new Date() })
						.where(and(eq(orders.id, reservedOrder.id), isNull(orders.payment_transaction_id)))
						.returning({ id: orders.id });
					if (!updatedOrder) throw new Error('Failed to complete order reservation');
					const [updatedProposal] = await tx
						.update(orders_proposals)
						.set({ status: ORDER_PROPOSAL_PHASES.accepted, updated_at: new Date() })
						.where(
							and(
								eq(orders_proposals.id, id),
								eq(orders_proposals.item_id, item_id),
								eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
							),
						)
						.returning();
					if (!updatedProposal) throw new Error('Failed to accept proposal');
					await tx.insert(chat_messages).values({
						chat_room_id: result.chatRoomId,
						sender_id: user.profile_id,
						message: `Proposal #${id}, has been accepted by the seller.`,
						message_type: 'system',
						metadata: { order_id: updatedOrder.id, type: 'proposal_accepted' },
					});
					return { updatedOrder, updatedProposal };
				});

				await bestEffortEmail(() =>
					sendProposalAcceptedMessage({
						to: result.mail.to,
						merchant_username: user.username,
						itemName: result.mail.itemName,
					}),
				);
				return c.json(
					{
						message: 'Proposal updated successfully',
						proposal: accepted.updatedProposal,
						order: { id: accepted.updatedOrder.id },
						transaction: { id: transaction.id, status: transaction.status },
					},
					200,
				);
			}

			await bestEffortEmail(() =>
				sendProposalRejectedMessage({
					to: result.mail.to,
					roomId: result.mail.roomId,
					merchant_username: user.username,
					itemName: result.mail.itemName,
				}),
			);
			return c.json(
				{
					message: 'Proposal updated successfully',
					proposal: result.updatedProposal,
				},
				200,
			);
		} catch (error) {
			console.error('Error updating proposal:', error);
			return c.json({ error: 'Failed to update proposal' }, 500);
		}
	})
	.post(
		`${authPath}/buyer_aborted_proposal`,
		authMiddleware,
		zValidator('json', buyer_abort_proposal_schema),
		async (c) => {
			const user = c.var.user;
			const { proposal_id } = c.req.valid('json');
			const { db } = createClient();

			try {
				const result = await db.transaction(async (tx) => {
					const [target] = await tx
						.select({ item_id: orders_proposals.item_id })
						.from(orders_proposals)
						.where(
							and(
								eq(orders_proposals.id, proposal_id),
								eq(orders_proposals.profile_id, user.profile_id),
								eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
							),
						)
						.limit(1);
					if (!target?.item_id) return { error: 'Proposal not found', status: 404 as const };
					await acquireItemCommerceLock(tx, target.item_id);
					const [proposal] = await tx
						.select({
							id: orders_proposals.id,
							item_id: orders_proposals.item_id,
							item_title: items.title,
							seller_email: users.email,
						})
						.from(orders_proposals)
						.innerJoin(items, eq(orders_proposals.item_id, items.id))
						.innerJoin(profiles, eq(items.profile_id, profiles.id))
						.innerJoin(users, eq(profiles.user_id, users.id))
						.where(
							and(
								eq(orders_proposals.id, proposal_id),
								eq(orders_proposals.profile_id, user.profile_id),
								eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
							),
						)
						.for('update', { of: orders_proposals })
						.limit(1);
					if (!proposal?.item_id) return { error: 'Proposal not found', status: 404 as const };
					const [activeOrder] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(and(eq(orders.item_id, proposal.item_id), inArray(orders.status, newOrderBlockedStates)))
						.limit(1);
					if (activeOrder) return { error: 'An active order already exists for this item', status: 400 as const };
					const [room] = await tx
						.select({ id: chat_rooms.id })
						.from(chat_rooms)
						.where(and(eq(chat_rooms.item_id, proposal.item_id), eq(chat_rooms.buyer_id, user.profile_id)))
						.limit(1);
					if (!room) return { error: 'Chat room not found', status: 404 as const };

					const [updated] = await tx
						.update(orders_proposals)
						.set({ status: ORDER_PROPOSAL_PHASES.buyer_aborted, updated_at: new Date() })
						.where(
							and(
								eq(orders_proposals.id, proposal_id),
								eq(orders_proposals.profile_id, user.profile_id),
								eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
							),
						)
						.returning({ id: orders_proposals.id });
					if (!updated) return { error: 'Proposal not found', status: 404 as const };
					await tx.insert(chat_messages).values({
						chat_room_id: room.id,
						sender_id: user.profile_id,
						message: `${user.username} has aborted the proposal #${proposal.id}.`,
						message_type: 'system',
						metadata: { type: 'proposal_buyer_aborted' },
					});
					return { proposal, sellerEmail: proposal.seller_email };
				});
				if ('error' in result) return c.json({ error: result.error }, result.status);
				await bestEffortEmail(() =>
					sendProposalCancelledMessage({
						to: result.sellerEmail,
						proposal_id,
						buyer_username: user.username,
						itemName: result.proposal.item_title,
					}),
				);
				return c.json({ message: 'Proposal aborted successfully' }, 200);
			} catch (error) {
				console.error('Error aborting proposal:', error);
				return c.json({ error: 'Failed to abort proposal' }, 500);
			}
		},
	)
	.get(`${authPath}/:id`, authMiddleware, async (c) => {
		const id = parseResourceId(c.req.param('id'));
		if (!id) return c.json({ error: 'Invalid proposal ID' }, 400);
		const user = c.var.user;
		const { db } = createClient();
		const [proposal] = await db
			.select({
				id: orders_proposals.id,
				status: orders_proposals.status,
				proposal_price: orders_proposals.proposal_price,
				created_at: orders_proposals.created_at,
			})
			.from(orders_proposals)
			.innerJoin(items, eq(orders_proposals.item_id, items.id))
			.where(
				and(
					eq(orders_proposals.id, id),
					or(eq(orders_proposals.profile_id, user.profile_id), eq(items.profile_id, user.profile_id)),
				),
			)
			.limit(1);
		if (!proposal) return c.json({ error: 'Proposal not found' }, 404);
		return c.json(proposal, 200);
	})
	.get(
		`${authPath}/by_item/:item_id`,
		zValidator('query', z.object({ status: z.enum(orderProposalStatusValues).optional() })),
		authMiddleware,
		async (c) => {
			const itemId = parseResourceId(c.req.param('item_id'));
			if (!itemId) return c.json({ error: 'Invalid item ID' }, 400);
			const user = c.var.user;
			const { status } = c.req.valid('query');
			const { db } = createClient();
			const participant = or(eq(orders_proposals.profile_id, user.profile_id), eq(items.profile_id, user.profile_id));
			const [proposal] = await db
				.select({
					id: orders_proposals.id,
					status: orders_proposals.status,
					created_at: orders_proposals.created_at,
				})
				.from(orders_proposals)
				.innerJoin(items, eq(orders_proposals.item_id, items.id))
				.where(
					and(
						eq(orders_proposals.item_id, itemId),
						participant,
						...(status ? [eq(orders_proposals.status, status as OrderProposalStatus)] : []),
					),
				)
				.orderBy(desc(orders_proposals.created_at), desc(orders_proposals.id))
				.limit(1);
			if (!proposal) return c.json({ error: 'Proposal not found' }, 404);
			return c.json(proposal, 200);
		},
	);
