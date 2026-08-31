import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';
import { zValidator } from '@hono/zod-validator';

import { createClient } from '#database/index';
import {
	addressStatus,
	EntityTrustapTransactionStatus,
	itemStatus,
	ORDER_PROPOSAL_PHASES,
	OrderProposalStatus,
	orderProposalStatusValues,
	PAYMENT_CREATION_STATES,
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
	shipping_quotes,
	subcategories,
	users,
} from '#db-schema';
import {
	buyer_abort_proposal_schema,
	create_order_proposal_schema,
	seller_update_order_proposal_schema,
} from '#extended_schemas';
import { acquireItemCommerceLock, itemCommerceOrderBlockingPredicate } from '#lib/item-commerce-lock';
import { ensurePaymentProviderIdentity } from '#lib/payment-provider-identity';
import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { sendProposalRejectedMessage } from '#mailer/templates/proposals/buyer/proposal-rejected';
import { sendProposalCancelledMessage } from '#mailer/templates/proposals/seller/proposal-buyer-cancelled';
import { sendNewProposalMessageSeller } from '#mailer/templates/proposals/seller/proposal-received';
import { authPath, environment } from '#utils/constants';
import { calculatePlatformCosts } from '#utils/platform-costs';

import { PaymentProviderHttpError, PaymentProviderService } from '../payments/payment-provider.service';
import { publicTrustapId } from '../payments/trustap-int64';
import { TransactionSyncService } from '../payments/transaction-sync.service';
import { parseProviderDecimalToCents, ShipmentService } from '../shipment-provider/shipment.service';
import { shipmentMatchesShippingState, shippingSnapshotFingerprint } from '../shipment-provider/shipment.service';

const postgresIntegerMax = 2_147_483_647;

function parseResourceId(value: string): number | undefined {
	if (!/^[1-9]\d*$/.test(value)) return undefined;
	const id = Number(value);
	return Number.isSafeInteger(id) && id <= postgresIntegerMax ? id : undefined;
}

function toPositiveCents(value: string | undefined): number | undefined {
	return value ? parseProviderDecimalToCents(value) : undefined;
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
		const { item_id, proposal_price, shipping_label_id, shipping_quote_id, message } = c.req.valid('json');
		const { db } = createClient();

		try {
			const [itemPreview] = await db
				.select({ id: items.id, profile_id: items.profile_id, price: items.price })
				.from(items)
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
			if (!itemPreview) return c.json({ error: 'Item not found' }, 404);
			if (itemPreview.profile_id === user.profile_id) {
				return c.json({ error: 'You cannot make a proposal for your own item' }, 400);
			}
			if (proposal_price >= itemPreview.price) {
				return c.json({ error: 'Proposal price must be lower than the item price' }, 400);
			}
			const [[pendingProposal], [activeOrder]] = await Promise.all([
				db
					.select({ id: orders_proposals.id })
					.from(orders_proposals)
					.where(
						and(
							eq(orders_proposals.item_id, item_id),
							eq(orders_proposals.profile_id, user.profile_id),
							eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
						),
					)
					.limit(1),
				db
					.select({ id: orders.id })
					.from(orders)
					.where(and(eq(orders.item_id, item_id), itemCommerceOrderBlockingPredicate()))
					.limit(1),
			]);
			if (pendingProposal) return c.json({ error: 'You already have an ongoing proposal for this item' }, 400);
			if (activeOrder) return c.json({ error: 'An active order already exists for this item' }, 400);

			const [quotePreview] = await db
				.select()
				.from(shipping_quotes)
				.where(
					and(
						eq(shipping_quotes.item_id, item_id),
						eq(shipping_quotes.buyer_profile_id, user.profile_id),
						shipping_quote_id
							? eq(shipping_quotes.id, shipping_quote_id)
							: eq(shipping_quotes.shippo_shipment_id, shipping_label_id),
						isNull(shipping_quotes.consumed_at),
					),
				)
				.orderBy(desc(shipping_quotes.created_at))
				.limit(1);
			const shipmentPreview = quotePreview
				? await new ShipmentService().getShippingLabel(quotePreview.shippo_shipment_id)
				: undefined;
			const previewRate = shipmentPreview?.rates?.find((rate) => rate.objectId === quotePreview?.shippo_rate_id);
			if (
				quotePreview &&
				(!shipmentPreview ||
					shipmentPreview.status !== 'SUCCESS' ||
					shipmentPreview.objectId !== quotePreview.shippo_shipment_id ||
					shipmentPreview.metadata !== `tvq1:${quotePreview.id}` ||
					!previewRate ||
					previewRate.shipment !== quotePreview.shippo_shipment_id ||
					previewRate.currency !== quotePreview.currency ||
					toPositiveCents(previewRate.amount) !== quotePreview.amount)
			) {
				return c.json({ error: 'Shipping quote is no longer valid' }, 400);
			}
			if (!quotePreview || quotePreview.expires_at <= new Date()) {
				return c.json({ error: 'Shipping quote not found or expired' }, 400);
			}
			await ensurePaymentProviderIdentity(db, user, c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1');
			const shippingPrice = quotePreview.amount;
			const { platform_charge_amount: platformCharge } = await calculatePlatformCosts(
				{ price: proposal_price },
				{ platform_charge_amount: true },
			);
			if (platformCharge === undefined) throw new Error('Failed to calculate platform charge amount');
			const transactionPrice = proposal_price + platformCharge;
			if (!Number.isSafeInteger(transactionPrice) || transactionPrice > postgresIntegerMax) {
				return c.json({ error: 'Proposal price exceeds the supported range' }, 400);
			}
			const { payment_provider_charge: paymentProviderCharge } = await calculatePlatformCosts(
				{ price: transactionPrice, postage_fee: shippingPrice },
				{ payment_provider_charge: true },
			);
			if (paymentProviderCharge === undefined) throw new Error('Failed to calculate payment provider charge');
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
				if (!quotePreview || quotePreview.expires_at <= new Date()) {
					return { error: 'Shipping quote not found or expired', status: 400 as const };
				}
				const [quote] = await tx
					.select()
					.from(shipping_quotes)
					.where(
						and(
							eq(shipping_quotes.id, quotePreview.id),
							eq(shipping_quotes.item_id, item_id),
							eq(shipping_quotes.buyer_profile_id, user.profile_id),
							eq(shipping_quotes.shippo_shipment_id, shipping_label_id),
							isNull(shipping_quotes.consumed_at),
						),
					)
					.for('update')
					.limit(1);
				if (!quote || quote.expires_at <= new Date()) {
					return { error: 'Shipping quote not found or expired', status: 400 as const };
				}
				const shippingState = {
					itemData: await new ShipmentService().getItemData(tx, item_id),
					buyerProfile: await new ShipmentService().getBuyerProfile(tx, user.profile_id),
				};
				if (shippingSnapshotFingerprint(shippingState) !== quote.snapshot_fingerprint) {
					return { error: 'Shipping inputs changed after quote creation', status: 400 as const };
				}
				if (!shipmentPreview || !shipmentMatchesShippingState(shipmentPreview, shippingState)) {
					return { error: 'Shipping quote provider context does not match', status: 400 as const };
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
					.where(and(eq(orders.item_id, item_id), itemCommerceOrderBlockingPredicate()))
					.limit(1);
				if (activeOrder) return { error: 'An active order already exists for this item', status: 400 as const };

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

				if (!buyer.payment_provider_id) return { error: 'Payment provider identity not found', status: 404 as const };

				const [proposal] = await tx
					.insert(orders_proposals)
					.values({
						item_id,
						profile_id: user.profile_id,
						proposal_price,
						payment_provider_charge: paymentProviderCharge,
						platform_charge: platformCharge,
						shipping_label_id,
						shipping_quote_id: quote.id,
						shipping_price: shippingPrice,
						original_price: item.price,
					})
					.returning();
				if (!proposal) throw new Error('Failed to create proposal');
				const [consumedQuote] = await tx
					.update(shipping_quotes)
					.set({
						consumed_at: new Date(),
						expires_at: new Date(
							proposal.created_at.getTime() + environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS * 60 * 60 * 1_000,
						),
					})
					.where(and(eq(shipping_quotes.id, quote.id), isNull(shipping_quotes.consumed_at)))
					.returning({ id: shipping_quotes.id });
				if (!consumedQuote) throw new Error('Shipping quote was already consumed');

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
		const paymentAttemptId = randomUUID();

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
						original_price: orders_proposals.original_price,
						current_item_price: items.price,
						platform_charge: orders_proposals.platform_charge,
						shipping_label_id: orders_proposals.shipping_label_id,
						shipping_quote_id: orders_proposals.shipping_quote_id,
						shipping_price: orders_proposals.shipping_price,
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

				const [buyerContact] = await tx
					.select({
						email: users.email,
					})
					.from(profiles)
					.innerJoin(users, eq(profiles.user_id, users.id))
					.where(eq(profiles.id, buyerProfileId))
					.limit(1);
				if (!buyerContact) return { error: 'Buyer information not found', status: 404 as const };

				const [chatRoom] = await tx
					.select({ id: chat_rooms.id })
					.from(chat_rooms)
					.where(and(eq(chat_rooms.item_id, resourceItemId), eq(chat_rooms.buyer_id, buyerProfileId)))
					.limit(1);
				if (!chatRoom) return { error: 'Chat room not found', status: 404 as const };
				const [activeOrder] = await tx
					.select({ id: orders.id })
					.from(orders)
					.where(and(eq(orders.item_id, item_id), itemCommerceOrderBlockingPredicate()))
					.limit(1);
				if (activeOrder) return { error: 'An active order already exists for this item', status: 400 as const };

				if (status === ORDER_PROPOSAL_PHASES.accepted) {
					if (!resource.shipping_quote_id || !resource.shipping_price) {
						return { error: 'Shipping quote not found', status: 400 as const };
					}
					const [buyer] = await tx
						.select({
							payment_provider_id: profiles.payment_provider_id,
							address_id: addresses.id,
						})
						.from(profiles)
						.innerJoin(
							addresses,
							and(eq(addresses.profile_id, profiles.id), eq(addresses.status, addressStatus.ACTIVE)),
						)
						.where(eq(profiles.id, buyerProfileId))
						.limit(1);
					if (!buyer) return { error: 'Buyer information not found', status: 404 as const };
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
					const [quote] = await tx
						.select()
						.from(shipping_quotes)
						.where(
							and(
								eq(shipping_quotes.id, resource.shipping_quote_id),
								eq(shipping_quotes.item_id, item_id),
								eq(shipping_quotes.buyer_profile_id, buyerProfileId),
							),
						)
						.for('update')
						.limit(1);
					if (!quote || quote.expires_at <= new Date() || quote.amount !== resource.shipping_price) {
						return { error: 'Shipping quote is no longer valid', status: 400 as const };
					}
					let shippingState: {
						itemData: Awaited<ReturnType<ShipmentService['getItemData']>>;
						buyerProfile: Awaited<ReturnType<ShipmentService['getBuyerProfile']>>;
					};
					try {
						shippingState = {
							itemData: await new ShipmentService().getItemData(tx, item_id),
							buyerProfile: await new ShipmentService().getBuyerProfile(tx, buyerProfileId),
						};
					} catch {
						return { error: 'Item or shipping terms are no longer available', status: 400 as const };
					}
					if (
						shippingSnapshotFingerprint(shippingState) !== quote.snapshot_fingerprint ||
						quote.seller_profile_id !== user.profile_id ||
						quote.buyer_address_id !== buyer.address_id ||
						quote.seller_address_id !== sellerAddress.id ||
						resource.original_price !== resource.current_item_price
					) {
						return { error: 'Shipping inputs changed after quote creation', status: 400 as const };
					}
					const shippingPrice = quote.amount;
					const transactionPrice = resource.proposal_price + resource.platform_charge;
					if (!Number.isSafeInteger(transactionPrice) || transactionPrice > postgresIntegerMax) {
						return { error: 'Proposal price exceeds the supported range', status: 400 as const };
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
							payment_provider_charge: 0,
							platform_charge: resource.platform_charge,
							shipping_label_id: resource.shipping_label_id,
							shipping_quote_id: quote.id,
							order_proposal_id: resource.proposal_id,
							item_price: resource.proposal_price,
							payment_attempt_id: paymentAttemptId,
							payment_creation_state: PAYMENT_CREATION_STATES.PREPARING,
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
						quote,
						shippingState,
						buyerAddressId: buyer.address_id,
						sellerAddressId: sellerAddress.id,
						originalPrice: resource.original_price,
						chatRoomId: chatRoom.id,
						itemTitle: resource.item_title,
						mail: { to: buyerContact.email, roomId: chatRoom.id, itemName: resource.item_title },
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
					mail: { to: buyerContact.email, roomId: chatRoom.id, itemName: resource.item_title },
				};
			});

			if ('error' in result) return c.json({ error: result.error }, result.status);
			if (result.kind === 'accept-reserved') {
				const clearPreparation = async () => {
					await db.transaction(async (tx) => {
						await acquireItemCommerceLock(tx, item_id);
						await tx
							.delete(orders)
							.where(
								and(
									eq(orders.id, result.reservationId),
									eq(orders.item_id, item_id),
									eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.PREPARING),
								),
							);
					});
				};

				let shipment: Awaited<ReturnType<ShipmentService['getShippingLabel']>>;
				try {
					shipment = await new ShipmentService().getShippingLabel(result.quote.shippo_shipment_id);
				} catch (providerError) {
					await clearPreparation();
					throw providerError;
				}
				const selectedRate = shipment.rates?.find((rate) => rate.objectId === result.quote.shippo_rate_id);
				if (
					shipment.status !== 'SUCCESS' ||
					shipment.objectId !== result.quote.shippo_shipment_id ||
					shipment.metadata !== `tvq1:${result.quote.id}` ||
					!selectedRate ||
					selectedRate.shipment !== result.quote.shippo_shipment_id ||
					selectedRate.currency !== result.quote.currency ||
					toPositiveCents(selectedRate.amount) !== result.quote.amount ||
					!shipmentMatchesShippingState(shipment, result.shippingState)
				) {
					await clearPreparation();
					return c.json({ error: 'Shipping quote is no longer valid' }, 400);
				}

				let paymentProviderCharge: number;
				let calculatorVersion: number;
				try {
					const costs = await calculatePlatformCosts(
						{ price: result.transactionPrice, postage_fee: result.shippingPrice },
						{ payment_provider_charge: true },
					);
					if (
						costs.payment_provider_charge === undefined ||
						costs.payment_provider_charge_calculator_version === undefined
					) {
						throw new Error('Failed to calculate transaction fee');
					}
					paymentProviderCharge = costs.payment_provider_charge;
					calculatorVersion = costs.payment_provider_charge_calculator_version;
				} catch (providerError) {
					await clearPreparation();
					throw providerError;
				}

				const ready = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, item_id);
					const [preparingOrder] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(
							and(
								eq(orders.id, result.reservationId),
								eq(orders.item_id, item_id),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.PREPARING),
							),
						)
						.limit(1);
					const [currentTerms] = await tx
						.select({
							proposal_price: orders_proposals.proposal_price,
							original_price: orders_proposals.original_price,
							platform_charge: orders_proposals.platform_charge,
							shipping_label_id: orders_proposals.shipping_label_id,
							shipping_quote_id: orders_proposals.shipping_quote_id,
							shipping_price: orders_proposals.shipping_price,
							item_price: items.price,
							seller_provider_id: profiles.payment_provider_id,
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
							),
						)
						.limit(1);
					const [buyer] = await tx
						.select({ payment_provider_id: profiles.payment_provider_id, address_id: addresses.id })
						.from(profiles)
						.innerJoin(
							addresses,
							and(eq(addresses.profile_id, profiles.id), eq(addresses.status, addressStatus.ACTIVE)),
						)
						.where(eq(profiles.id, result.quote.buyer_profile_id))
						.limit(1);
					const [quote] = await tx
						.select()
						.from(shipping_quotes)
						.where(eq(shipping_quotes.id, result.quote.id))
						.for('update')
						.limit(1);

					let currentShippingState: typeof result.shippingState | undefined;
					try {
						currentShippingState = {
							itemData: await new ShipmentService().getItemData(tx, item_id),
							buyerProfile: await new ShipmentService().getBuyerProfile(tx, result.quote.buyer_profile_id),
						};
					} catch {
						currentShippingState = undefined;
					}
					const currentFingerprint = currentShippingState
						? shippingSnapshotFingerprint(currentShippingState)
						: undefined;
					if (
						!preparingOrder ||
						!currentTerms ||
						!buyer?.payment_provider_id ||
						!quote ||
						quote.expires_at <= new Date() ||
						currentTerms.proposal_price + currentTerms.platform_charge !== result.transactionPrice ||
						currentTerms.original_price !== result.originalPrice ||
						currentTerms.item_price !== result.originalPrice ||
						currentTerms.shipping_label_id !== result.quote.shippo_shipment_id ||
						currentTerms.shipping_quote_id !== result.quote.id ||
						currentTerms.shipping_price !== result.quote.amount ||
						currentTerms.seller_provider_id !== result.sellerProviderId ||
						buyer.payment_provider_id !== result.buyerProviderId ||
						buyer.address_id !== result.buyerAddressId ||
						quote.seller_address_id !== result.sellerAddressId ||
						quote.buyer_address_id !== result.buyerAddressId ||
						quote.snapshot_fingerprint !== currentFingerprint ||
						!currentShippingState ||
						!shipmentMatchesShippingState(shipment, currentShippingState)
					) {
						await tx.delete(orders).where(eq(orders.id, result.reservationId));
						return { error: 'Proposal or checkout terms changed', status: 409 as const };
					}
					const [reservedOrder] = await tx
						.update(orders)
						.set({
							payment_provider_charge: paymentProviderCharge,
							payment_creation_state: PAYMENT_CREATION_STATES.CREATING,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(orders.id, result.reservationId),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.PREPARING),
							),
						)
						.returning({ id: orders.id });
					if (!reservedOrder) throw new Error('Failed to complete proposal checkout preparation');
					return { reservedOrder };
				});
				if ('error' in ready) return c.json({ error: ready.error }, ready.status);

				let transaction: Awaited<ReturnType<PaymentProviderService['createTransactionWithBothUsers']>>;
				try {
					transaction = await new PaymentProviderService().createTransactionWithBothUsers({
						buyer_id: result.buyerProviderId,
						seller_id: result.sellerProviderId,
						creator_role: 'seller',
						currency: 'eur',
						description: `Transaction for ${result.itemTitle} - (Proposal #${id}, ref ${paymentAttemptId})`,
						price: result.transactionPrice,
						postage_fee: result.shippingPrice,
						charge: paymentProviderCharge,
						charge_calculator_version: calculatorVersion,
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
					} else {
						await db
							.update(orders)
							.set({
								payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
								updated_at: new Date(),
							})
							.where(eq(orders.id, result.reservationId));
					}
					throw providerError;
				}

				let accepted: { updatedOrder: { id: number }; updatedProposal: typeof orders_proposals.$inferSelect };
				try {
					accepted = await db.transaction(async (tx) => {
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
							charge: paymentProviderCharge,
							chargeSeller: transaction.charge_seller || 0,
							currency: 'eur',
							entityTitle: result.itemTitle,
							claimedBySeller: false,
							claimedByBuyer: false,
							complaintPeriodDeadline: null,
						});
						const [updatedOrder] = await tx
							.update(orders)
							.set({
								payment_transaction_id: transaction.id,
								payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
								updated_at: new Date(),
							})
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
				} catch (finalizationError) {
					try {
						await db
							.update(orders)
							.set({
								payment_transaction_id: transaction.id,
								payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
								updated_at: new Date(),
							})
							.where(eq(orders.id, result.reservationId));
					} catch {
						await db
							.update(orders)
							.set({
								legacy_payment_transaction_id: transaction.id,
								payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
								updated_at: new Date(),
							})
							.where(eq(orders.id, result.reservationId));
					}
					throw finalizationError;
				}

				await new TransactionSyncService().dispatchPendingRecoveryNotifications();
				return c.json(
					{
						message: 'Proposal updated successfully',
						proposal: accepted.updatedProposal,
						order: { id: accepted.updatedOrder.id },
						transaction: { id: publicTrustapId(transaction.id), status: transaction.status },
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
						.where(and(eq(orders.item_id, proposal.item_id), itemCommerceOrderBlockingPredicate()))
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
