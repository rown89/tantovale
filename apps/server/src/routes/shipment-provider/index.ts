import z from 'zod/v4';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { createRouter } from '#lib/create-app';
import { createClient, type DrizzleClient } from '#create-client';
import {
	entityTrustapTransactions,
	items,
	orders,
	profiles,
	shipping_label_purchases,
	shipping_quotes,
	SHIPPING_LABEL_PURCHASE_STATES,
} from '#db-schema';
import { SHIPPING_LABEL_REFUND_STATES } from '../../database/schemas/shipping_label_purchases';
import {
	entityTrustapTransactionTypeValues,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '#database/schemas/enumerated_values';
import { authPath, SHIPPING_ERROR_MESSAGES } from '#utils/constants';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { ShipmentService, ShippoProviderError, shippingLabelTransactionMetadata } from './shipment.service';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';
import { alias } from 'drizzle-orm/pg-core';
import { shippingOpenApi } from '../../openapi/routes';
import { PaymentProviderService } from '../payments/payment-provider.service';

const postgresIntegerMax = 2_147_483_647;
const definitelyRejectedShippoStatuses = new Set([400, 401, 403, 404, 422]);
type ItemTransaction = Parameters<Parameters<DrizzleClient['db']['transaction']>[0]>[0];
const labelBuyerProfiles = alias(profiles, 'label_buyer_profiles');
const labelSellerProfiles = alias(profiles, 'label_seller_profiles');

async function readLabelPaymentGraph(tx: ItemTransaction, orderId: number, itemId: number) {
	const [graph] = await tx
		.select({
			id: orders.id,
			item_id: orders.item_id,
			buyer_id: orders.buyer_id,
			seller_id: orders.seller_id,
			buyer_address: orders.buyer_address,
			seller_address: orders.seller_address,
			shipping_label_id: orders.shipping_label_id,
			shipping_price: orders.shipping_price,
			shipping_quote_id: orders.shipping_quote_id,
			status: orders.status,
			payment_creation_state: orders.payment_creation_state,
			payment_cancellation_state: orders.payment_cancellation_state,
			payment_transaction_id: orders.payment_transaction_id,
			payment_attempt_id: orders.payment_attempt_id,
			item_price: orders.item_price,
			platform_charge: orders.platform_charge,
			payment_provider_charge: orders.payment_provider_charge,
			buyer_provider_id: labelBuyerProfiles.payment_provider_id,
			seller_provider_id: labelSellerProfiles.payment_provider_id,
			provider_entity_id: entityTrustapTransactions.entityId,
			item_title: items.title,
			provider_transaction_id: entityTrustapTransactions.transactionId,
			provider_transaction_type: entityTrustapTransactions.transactionType,
			provider_buyer_id: entityTrustapTransactions.buyerId,
			provider_seller_id: entityTrustapTransactions.sellerId,
			provider_status: entityTrustapTransactions.status,
			provider_price: entityTrustapTransactions.price,
			provider_charge: entityTrustapTransactions.charge,
			provider_charge_seller: entityTrustapTransactions.chargeSeller,
			provider_currency: entityTrustapTransactions.currency,
			provider_quarantined: entityTrustapTransactions.quarantined,
			provider_entity_title: entityTrustapTransactions.entityTitle,
		})
		.from(orders)
		.leftJoin(labelBuyerProfiles, eq(orders.buyer_id, labelBuyerProfiles.id))
		.leftJoin(labelSellerProfiles, eq(orders.seller_id, labelSellerProfiles.id))
		.leftJoin(items, eq(orders.item_id, items.id))
		.leftJoin(entityTrustapTransactions, eq(orders.payment_transaction_id, entityTrustapTransactions.transactionId))
		.where(and(eq(orders.id, orderId), eq(orders.item_id, itemId)))
		.limit(1);
	return graph;
}

export type LabelPaymentGraph = NonNullable<Awaited<ReturnType<typeof readLabelPaymentGraph>>>;

export function labelPaymentGraphIsReady(graph: LabelPaymentGraph | undefined): boolean {
	return Boolean(
		graph &&
			(graph.status === ORDER_PHASES.PAYMENT_CONFIRMED || graph.status === ORDER_PHASES.SHIPPING_PENDING) &&
			graph.payment_creation_state === PAYMENT_CREATION_STATES.CREATED &&
			graph.payment_cancellation_state === PAYMENT_CANCELLATION_STATES.NONE &&
			graph.payment_transaction_id !== null &&
			graph.payment_attempt_id !== null &&
			graph.item_id !== null &&
			graph.buyer_id !== null &&
			graph.seller_id !== null &&
			graph.buyer_address !== null &&
			graph.seller_address !== null &&
			graph.provider_quarantined === false &&
			graph.provider_status === entityTrustapTransactionTypeValues.PAID &&
			graph.provider_transaction_type === 'online_payment' &&
			graph.provider_transaction_id === graph.payment_transaction_id &&
			graph.provider_entity_id === graph.item_id &&
			graph.provider_entity_title === graph.item_title &&
			graph.provider_buyer_id === graph.buyer_provider_id &&
			graph.provider_seller_id === graph.seller_provider_id &&
			graph.provider_currency === 'eur' &&
			graph.provider_price === graph.item_price + graph.platform_charge &&
			graph.provider_charge === graph.payment_provider_charge &&
			graph.provider_charge_seller === 0,
	);
}

const calculateShipmentCostSchema = z.object({
	item_id: z.number().int().positive('Item ID must be a positive integer').max(postgresIntegerMax),
});

const createLabelSchema = z.object({
	order_id: z.number().int().positive().max(postgresIntegerMax),
	rate_id: z.string().trim().min(1),
});

const refundLabelSchema = z.object({
	order_id: z.number().int().positive().max(postgresIntegerMax),
});

const refundableOrderPhases = new Set<string>([ORDER_PHASES.PAYMENT_REFUNDED, ORDER_PHASES.CANCELLED]);

function refundStateForProviderStatus(status: 'QUEUED' | 'PENDING' | 'SUCCESS' | 'ERROR') {
	if (status === 'SUCCESS') return SHIPPING_LABEL_REFUND_STATES.REFUNDED;
	if (status === 'ERROR') return SHIPPING_LABEL_REFUND_STATES.REJECTED;
	return SHIPPING_LABEL_REFUND_STATES.PENDING;
}

function refundResponse(refund: {
	provider_refund_id: string;
	provider_refund_status: string;
	provider_transaction_id: string;
	refund_state: string;
}) {
	return {
		refund: {
			id: refund.provider_refund_id,
			state: refund.refund_state,
			provider_status: refund.provider_refund_status,
			transaction_id: refund.provider_transaction_id,
		},
	};
}

type LabelProjection = {
	id: string;
	status: string;
	label_url: string;
	tracking_number?: string;
	tracking_url?: string;
};

function labelResponse(label: LabelProjection) {
	return {
		label: {
			id: label.id,
			status: label.status,
			label_url: label.label_url,
			...(label.tracking_number ? { tracking_number: label.tracking_number } : {}),
			...(label.tracking_url ? { tracking_url: label.tracking_url } : {}),
		},
	};
}

const ERROR_MESSAGES = {
	ITEM_NOT_FOUND: 'Item not found or not available',
	SELLER_ADDRESS_NOT_FOUND: 'Seller address not found',
	BUYER_PROFILE_NOT_FOUND: 'Buyer profile not found',
	UNAUTHORIZED_ACCESS: 'You do not have permission to access this item',
	...SHIPPING_ERROR_MESSAGES,
} as const;

export const shipmentProviderRoute = createRouter()
	.get(`/${authPath}/active_carriers`, describeRoute(shippingOpenApi.carriers), authMiddleware, async (c) => {
		try {
			const activeCarriers = await new ShipmentService().listActiveCarriers();
			if (activeCarriers.length === 0) {
				return c.json({ message: 'No active carriers found' }, 404);
			}
			return c.json({ activeCarriers }, 200);
		} catch {
			return c.json({ message: 'Failed to fetch active carriers' }, 502);
		}
	})
	.post(
		`/${authPath}/calculate_shipment_cost`,
		describeRoute(shippingOpenApi.quote),
		authMiddleware,
		zValidator('json', calculateShipmentCostSchema),
		async (c) => {
			try {
				const user = c.get('user');

				const { item_id } = c.req.valid('json');

				if (!user) {
					return c.json({ message: 'User not authenticated' }, 401);
				}

				// get profile_id from user
				const profile_id = user.profile_id;

				const quote = await new ShipmentService().createShippingQuote(item_id, profile_id, user.email);
				return c.json({ rates: [quote] }, 200);
			} catch (error) {
				if (error instanceof ShippoProviderError) {
					return c.json({ message: 'Shipping provider request failed' }, 502);
				}
				if (error instanceof Error) {
					const errorMessage = error.message;
					if (
						Object.values(ERROR_MESSAGES).includes(errorMessage as (typeof ERROR_MESSAGES)[keyof typeof ERROR_MESSAGES])
					) {
						return c.json({ message: errorMessage }, 400);
					}
				}

				return c.json({ message: 'Internal server error' }, 500);
			}
		},
	)
	.post(
		`/${authPath}/create_label`,
		describeRoute(shippingOpenApi.label),
		zValidator('json', createLabelSchema),
		async (c) => {
			const user = c.get('user');
			if (!user) return c.json({ message: 'User not authenticated' }, 401);
			const { order_id, rate_id } = c.req.valid('json');
			const { db } = createClient();
			const [candidate] = await db
				.select({ item_id: orders.item_id })
				.from(orders)
				.where(and(eq(orders.id, order_id), eq(orders.seller_id, user.profile_id)))
				.limit(1);
			if (!candidate?.item_id) return c.json({ message: 'Order not found' }, 404);
			const itemId = candidate.item_id;

			const attemptId = randomUUID();
			const claim = await db.transaction(async (tx) => {
				await acquireItemCommerceLock(tx, itemId);
				const order = await readLabelPaymentGraph(tx, order_id, itemId);
				if (!order?.item_id || order.seller_id !== user.profile_id) return { kind: 'not_found' as const };

				const [existing] = await tx
					.select()
					.from(shipping_label_purchases)
					.where(eq(shipping_label_purchases.order_id, order.id))
					.for('update')
					.limit(1);
				if (existing) {
					if (existing.shippo_rate_id !== rate_id) return { kind: 'rate_mismatch' as const };
					if (
						existing.state === SHIPPING_LABEL_PURCHASE_STATES.PURCHASED &&
						existing.provider_transaction_id &&
						existing.provider_status &&
						existing.label_url
					) {
						return {
							kind: 'purchased' as const,
							label: {
								id: existing.provider_transaction_id,
								status: existing.provider_status,
								label_url: existing.label_url,
								...(existing.tracking_number ? { tracking_number: existing.tracking_number } : {}),
								...(existing.tracking_url ? { tracking_url: existing.tracking_url } : {}),
							},
						};
					}
					return { kind: 'in_progress' as const };
				}
				if (!labelPaymentGraphIsReady(order)) return { kind: 'wrong_state' as const };

				if (!order.shipping_quote_id) return { kind: 'missing_quote' as const };
				const [quote] = await tx
					.select()
					.from(shipping_quotes)
					.where(eq(shipping_quotes.id, order.shipping_quote_id))
					.for('update')
					.limit(1);
				if (!quote?.consumed_at) return { kind: 'missing_quote' as const };
				if (quote.shippo_rate_id !== rate_id) return { kind: 'rate_mismatch' as const };
				if (
					quote.item_id !== order.item_id ||
					quote.buyer_profile_id !== order.buyer_id ||
					quote.seller_profile_id !== order.seller_id ||
					quote.buyer_address_id !== order.buyer_address ||
					quote.seller_address_id !== order.seller_address ||
					quote.shippo_shipment_id !== order.shipping_label_id ||
					quote.amount !== order.shipping_price ||
					quote.currency !== 'EUR'
				) {
					return { kind: 'invalid_quote' as const };
				}

				const [purchase] = await tx
					.insert(shipping_label_purchases)
					.values({
						order_id: order.id,
						item_id: order.item_id,
						purchase_attempt_id: attemptId,
						shippo_rate_id: quote.shippo_rate_id,
					})
					.returning({ id: shipping_label_purchases.id });
				if (!purchase) throw new Error('Failed to claim shipping label purchase');
				return {
					kind: 'claimed' as const,
					purchaseId: purchase.id,
					itemId: order.item_id,
					rateId: quote.shippo_rate_id,
					shipmentId: quote.shippo_shipment_id,
					amount: quote.amount,
					transactionId: order.payment_transaction_id!,
					buyerProviderId: order.buyer_provider_id!,
					sellerProviderId: order.seller_provider_id!,
				};
			});

			if (claim.kind === 'not_found') return c.json({ message: 'Order not found' }, 404);
			if (claim.kind === 'wrong_state') return c.json({ message: 'Order is not ready for label purchase' }, 409);
			if (claim.kind === 'rate_mismatch') {
				return c.json({ message: 'Shipping rate does not match the consumed quote' }, 400);
			}
			if (claim.kind === 'missing_quote') return c.json({ message: 'Order has no consumed shipping quote' }, 409);
			if (claim.kind === 'invalid_quote') return c.json({ message: 'Order shipping quote is inconsistent' }, 409);
			if (claim.kind === 'in_progress') {
				return c.json({ message: 'Shipping label purchase requires reconciliation' }, 409);
			}
			if (claim.kind === 'purchased') return c.json(labelResponse(claim.label), 201);

			const clearPrePostClaim = async () => {
				await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, claim.itemId);
					await tx
						.delete(shipping_label_purchases)
						.where(
							and(
								eq(shipping_label_purchases.id, claim.purchaseId),
								eq(shipping_label_purchases.purchase_attempt_id, attemptId),
								eq(shipping_label_purchases.state, SHIPPING_LABEL_PURCHASE_STATES.CREATING),
							),
						);
				});
			};
			const markClaimForReconciliation = async (
				providerEvidence?: Extract<
					Awaited<ReturnType<ShipmentService['purchaseVerifiedLabel']>>,
					{ status: 'SUCCESS' }
				>,
			) => {
				await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, claim.itemId);
					const [stored] = await tx
						.update(shipping_label_purchases)
						.set({
							state: SHIPPING_LABEL_PURCHASE_STATES.RECONCILIATION_REQUIRED,
							...(providerEvidence
								? {
										provider_transaction_id: providerEvidence.objectId,
										provider_status: providerEvidence.status,
										label_url: providerEvidence.labelUrl,
										tracking_number: providerEvidence.trackingNumber ?? null,
										tracking_url: providerEvidence.trackingUrlProvider ?? null,
									}
								: {}),
							updated_at: new Date(),
						})
						.where(
							and(
								eq(shipping_label_purchases.id, claim.purchaseId),
								eq(shipping_label_purchases.purchase_attempt_id, attemptId),
								eq(shipping_label_purchases.state, SHIPPING_LABEL_PURCHASE_STATES.CREATING),
							),
						)
						.returning({ id: shipping_label_purchases.id });
					if (!stored) throw new Error('Shipping label purchase claim was lost');
				});
			};
			const recordClaimProviderEvidence = async (
				providerEvidence: Extract<Awaited<ReturnType<ShipmentService['purchaseVerifiedLabel']>>, { status: 'SUCCESS' }>,
			) => {
				await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, claim.itemId);
					const [stored] = await tx
						.update(shipping_label_purchases)
						.set({
							provider_transaction_id: providerEvidence.objectId,
							provider_status: providerEvidence.status,
							label_url: providerEvidence.labelUrl,
							tracking_number: providerEvidence.trackingNumber ?? null,
							tracking_url: providerEvidence.trackingUrlProvider ?? null,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(shipping_label_purchases.id, claim.purchaseId),
								eq(shipping_label_purchases.purchase_attempt_id, attemptId),
								eq(shipping_label_purchases.state, SHIPPING_LABEL_PURCHASE_STATES.CREATING),
							),
						)
						.returning({ id: shipping_label_purchases.id });
					if (!stored) throw new Error('Shipping label purchase claim was lost');
				});
			};

			const shipmentService = new ShipmentService();
			let verifiedRate: Awaited<ReturnType<ShipmentService['verifyRateForPurchase']>>;
			try {
				verifiedRate = await shipmentService.verifyRateForPurchase({
					rateId: claim.rateId,
					shipmentId: claim.shipmentId,
					amount: claim.amount,
					currency: 'EUR',
				});
			} catch (error) {
				await clearPrePostClaim();
				return c.json(
					{ message: 'Shipping provider request failed' },
					error instanceof ShippoProviderError ? 502 : 500,
				);
			}

			// Provider I/O above does not hold the item lock. Re-read the order and
			// intent immediately before POST; after this point the durable CREATING
			// intent makes webhook/poller transitions defer until finalization.
			const mayPost = await db.transaction(async (tx) => {
				await acquireItemCommerceLock(tx, claim.itemId);
				const order = await readLabelPaymentGraph(tx, order_id, claim.itemId);
				const [intent] = await tx
					.select({ state: shipping_label_purchases.state })
					.from(shipping_label_purchases)
					.where(
						and(
							eq(shipping_label_purchases.id, claim.purchaseId),
							eq(shipping_label_purchases.purchase_attempt_id, attemptId),
						),
					)
					.for('update')
					.limit(1);
				if (intent?.state !== SHIPPING_LABEL_PURCHASE_STATES.CREATING) return false;
				if (labelPaymentGraphIsReady(order)) return true;
				await tx
					.update(shipping_label_purchases)
					.set({ state: SHIPPING_LABEL_PURCHASE_STATES.RECONCILIATION_REQUIRED, updated_at: new Date() })
					.where(eq(shipping_label_purchases.id, claim.purchaseId));
				return false;
			});
			if (!mayPost) return c.json({ message: 'Shipping label purchase requires reconciliation' }, 409);

			let outcome: Awaited<ReturnType<ShipmentService['purchaseVerifiedLabel']>>;
			try {
				outcome = await shipmentService.purchaseVerifiedLabel(
					claim.rateId,
					shippingLabelTransactionMetadata(order_id, attemptId),
				);
			} catch (error) {
				const definiteRejection =
					error instanceof ShippoProviderError &&
					error.category === 'http' &&
					error.status !== undefined &&
					definitelyRejectedShippoStatuses.has(error.status);
				if (definiteRejection) await clearPrePostClaim();
				else await markClaimForReconciliation();
				return c.json({ message: 'Shipping provider request failed' }, 502);
			}
			if (outcome.status === 'ERROR') {
				await clearPrePostClaim();
				return c.json({ message: 'Shipping provider request failed' }, 502);
			}
			const transaction = outcome;
			if (!transaction.trackingNumber) {
				await markClaimForReconciliation(transaction);
				return c.json({ message: 'Shipping label purchase requires reconciliation' }, 502);
			}
			try {
				await recordClaimProviderEvidence(transaction);
				const paymentProvider = new PaymentProviderService();
				const carrier = await paymentProvider.resolveSupportedCarrierCode(verifiedRate.provider);
				await paymentProvider.trackGuestTransaction({
					transaction_id: claim.transactionId,
					acting_provider_user_id: claim.sellerProviderId,
					buyer_provider_user_id: claim.buyerProviderId,
					carrier,
					tracking_code: transaction.trackingNumber,
				});
			} catch {
				try {
					await markClaimForReconciliation(transaction);
				} catch {
					// The untouched durable claim remains fail-closed.
				}
				return c.json({ message: 'Shipping label purchase requires reconciliation' }, 502);
			}

			let stored;
			try {
				stored = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, claim.itemId);
					const paymentGraph = await readLabelPaymentGraph(tx, order_id, claim.itemId);
					const ready = labelPaymentGraphIsReady(paymentGraph);
					const [purchase] = await tx
						.update(shipping_label_purchases)
						.set({
							state: ready
								? SHIPPING_LABEL_PURCHASE_STATES.PURCHASED
								: SHIPPING_LABEL_PURCHASE_STATES.RECONCILIATION_REQUIRED,
							provider_transaction_id: transaction.objectId,
							provider_status: transaction.status,
							label_url: transaction.labelUrl,
							tracking_number: transaction.trackingNumber ?? null,
							tracking_url: transaction.trackingUrlProvider ?? null,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(shipping_label_purchases.id, claim.purchaseId),
								eq(shipping_label_purchases.purchase_attempt_id, attemptId),
								eq(shipping_label_purchases.state, SHIPPING_LABEL_PURCHASE_STATES.CREATING),
							),
						)
						.returning();
					if (!purchase) throw new Error('Shipping label purchase claim was lost');
					if (!ready) return purchase;
					const [provider] = await tx
						.update(entityTrustapTransactions)
						.set({ status: entityTrustapTransactionTypeValues.TRACKED, updated_at: new Date() })
						.where(
							and(
								eq(entityTrustapTransactions.transactionId, claim.transactionId),
								eq(entityTrustapTransactions.status, entityTrustapTransactionTypeValues.PAID),
								eq(entityTrustapTransactions.quarantined, false),
							),
						)
						.returning({ id: entityTrustapTransactions.id });
					const [updatedOrder] = await tx
						.update(orders)
						.set({ status: ORDER_PHASES.SHIPPING_CONFIRMED, updated_at: new Date() })
						.where(eq(orders.id, order_id))
						.returning({ id: orders.id });
					if (!provider || !updatedOrder) throw new Error('Failed to finalize Trustap tracking state');
					return purchase;
				});
			} catch {
				// Shippo returned a known SUCCESS. Preserve that evidence even when
				// the normal purchased finalization fails. If this compensation also
				// fails, the original CREATING row remains a durable blocking claim.
				try {
					await markClaimForReconciliation(transaction);
				} catch {
					// The untouched durable claim is intentionally fail-closed.
				}
				return c.json({ message: 'Shipping label purchase requires reconciliation' }, 502);
			}

			if (stored.state !== SHIPPING_LABEL_PURCHASE_STATES.PURCHASED) {
				return c.json({ message: 'Shipping label purchase requires reconciliation' }, 409);
			}

			return c.json(
				labelResponse({
					id: stored.provider_transaction_id!,
					status: stored.provider_status!,
					label_url: stored.label_url!,
					...(stored.tracking_number ? { tracking_number: stored.tracking_number } : {}),
					...(stored.tracking_url ? { tracking_url: stored.tracking_url } : {}),
				}),
				201,
			);
		},
	)
	.post(
		`/${authPath}/refund_label`,
		describeRoute(shippingOpenApi.refund),
		zValidator('json', refundLabelSchema),
		async (c) => {
			const user = c.get('user');
			if (!user) return c.json({ message: 'User not authenticated' }, 401);
			const { order_id } = c.req.valid('json');
			const { db } = createClient();
			const [candidate] = await db
				.select({ item_id: orders.item_id })
				.from(orders)
				.where(and(eq(orders.id, order_id), eq(orders.seller_id, user.profile_id)))
				.limit(1);
			if (!candidate?.item_id) return c.json({ message: 'Order not found' }, 404);

			const attemptId = randomUUID();
			const claim = await db.transaction(async (tx) => {
				await acquireItemCommerceLock(tx, candidate.item_id!);
				const [order] = await tx
					.select({ id: orders.id, status: orders.status, seller_id: orders.seller_id })
					.from(orders)
					.where(eq(orders.id, order_id))
					.for('update')
					.limit(1);
				if (!order || order.seller_id !== user.profile_id) return { kind: 'not_found' as const };

				const [purchase] = await tx
					.select()
					.from(shipping_label_purchases)
					.where(eq(shipping_label_purchases.order_id, order.id))
					.for('update')
					.limit(1);
				if (
					!purchase ||
					purchase.state !== SHIPPING_LABEL_PURCHASE_STATES.PURCHASED ||
					!purchase.provider_transaction_id
				) {
					return { kind: 'missing_label' as const };
				}
				if (purchase.refund_state === SHIPPING_LABEL_REFUND_STATES.NONE) {
					if (!refundableOrderPhases.has(order.status)) return { kind: 'wrong_state' as const };
					const requestedAt = new Date();
					const [claimed] = await tx
						.update(shipping_label_purchases)
						.set({
							refund_state: SHIPPING_LABEL_REFUND_STATES.REQUESTING,
							refund_attempt_id: attemptId,
							refund_requested_at: requestedAt,
							updated_at: requestedAt,
						})
						.where(eq(shipping_label_purchases.id, purchase.id))
						.returning({ id: shipping_label_purchases.id });
					if (!claimed) throw new Error('Failed to claim shipping label refund');
					return {
						kind: 'create' as const,
						itemId: candidate.item_id!,
						purchaseId: purchase.id,
						transactionId: purchase.provider_transaction_id,
					};
				}
				if (purchase.refund_state === SHIPPING_LABEL_REFUND_STATES.PENDING && purchase.provider_refund_id) {
					return {
						kind: 'refresh' as const,
						itemId: candidate.item_id!,
						purchaseId: purchase.id,
						refundId: purchase.provider_refund_id,
						transactionId: purchase.provider_transaction_id,
					};
				}
				if (
					(purchase.refund_state === SHIPPING_LABEL_REFUND_STATES.REFUNDED ||
						purchase.refund_state === SHIPPING_LABEL_REFUND_STATES.REJECTED) &&
					purchase.provider_refund_id &&
					purchase.provider_refund_status
				) {
					return { kind: 'known' as const, refund: purchase };
				}
				return { kind: 'reconciliation' as const };
			});

			if (claim.kind === 'not_found') return c.json({ message: 'Order not found' }, 404);
			if (claim.kind === 'missing_label') return c.json({ message: 'Order has no purchased shipping label' }, 409);
			if (claim.kind === 'wrong_state') return c.json({ message: 'Order is not eligible for label refund' }, 409);
			if (claim.kind === 'reconciliation') {
				return c.json({ message: 'Shipping label refund requires reconciliation' }, 409);
			}
			if (claim.kind === 'known') {
				return c.json(
					refundResponse({
						provider_refund_id: claim.refund.provider_refund_id!,
						provider_refund_status: claim.refund.provider_refund_status!,
						provider_transaction_id: claim.refund.provider_transaction_id!,
						refund_state: claim.refund.refund_state,
					}),
					200,
				);
			}

			const shipmentService = new ShipmentService();
			let providerRefund: Awaited<ReturnType<ShipmentService['createVerifiedRefund']>>;
			if (claim.kind === 'refresh') {
				try {
					providerRefund = await shipmentService.getVerifiedRefund(claim.refundId, claim.transactionId);
				} catch {
					return c.json({ message: 'Shipping provider request failed' }, 502);
				}
			} else {
				try {
					providerRefund = await shipmentService.createVerifiedRefund(claim.transactionId);
				} catch (error) {
					const definiteRejection =
						error instanceof ShippoProviderError &&
						error.category === 'http' &&
						error.status !== undefined &&
						definitelyRejectedShippoStatuses.has(error.status);
					await db.transaction(async (tx) => {
						await acquireItemCommerceLock(tx, claim.itemId);
						await tx
							.update(shipping_label_purchases)
							.set(
								definiteRejection
									? {
											refund_state: SHIPPING_LABEL_REFUND_STATES.NONE,
											refund_attempt_id: null,
											refund_requested_at: null,
											updated_at: new Date(),
										}
									: {
											refund_state: SHIPPING_LABEL_REFUND_STATES.RECONCILIATION_REQUIRED,
											updated_at: new Date(),
										},
							)
							.where(
								and(
									eq(shipping_label_purchases.id, claim.purchaseId),
									eq(shipping_label_purchases.refund_attempt_id, attemptId),
									eq(shipping_label_purchases.refund_state, SHIPPING_LABEL_REFUND_STATES.REQUESTING),
								),
							);
					});
					return c.json({ message: 'Shipping provider request failed' }, 502);
				}
			}

			const nextRefundState = refundStateForProviderStatus(providerRefund.status);
			let stored;
			try {
				stored = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, claim.itemId);
					const [updated] = await tx
						.update(shipping_label_purchases)
						.set({
							refund_state: nextRefundState,
							provider_refund_id: providerRefund.objectId,
							provider_refund_status: providerRefund.status,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(shipping_label_purchases.id, claim.purchaseId),
								claim.kind === 'create'
									? and(
											eq(shipping_label_purchases.refund_attempt_id, attemptId),
											eq(shipping_label_purchases.refund_state, SHIPPING_LABEL_REFUND_STATES.REQUESTING),
										)
									: and(
											eq(shipping_label_purchases.provider_refund_id, claim.refundId),
											eq(shipping_label_purchases.refund_state, SHIPPING_LABEL_REFUND_STATES.PENDING),
										),
							),
						)
						.returning();
					if (!updated) throw new Error('Shipping label refund claim was lost');
					return updated;
				});
			} catch {
				if (claim.kind === 'create') {
					try {
						await db
							.update(shipping_label_purchases)
							.set({
								refund_state: SHIPPING_LABEL_REFUND_STATES.RECONCILIATION_REQUIRED,
								provider_refund_id: providerRefund.objectId,
								provider_refund_status: providerRefund.status,
								updated_at: new Date(),
							})
							.where(
								and(
									eq(shipping_label_purchases.id, claim.purchaseId),
									eq(shipping_label_purchases.refund_attempt_id, attemptId),
									eq(shipping_label_purchases.refund_state, SHIPPING_LABEL_REFUND_STATES.REQUESTING),
								),
							);
					} catch {
						// The REQUESTING claim remains a durable retry barrier.
					}
				}
				return c.json({ message: 'Shipping label refund requires reconciliation' }, 502);
			}

			return c.json(
				refundResponse({
					provider_refund_id: stored.provider_refund_id!,
					provider_refund_status: stored.provider_refund_status!,
					provider_transaction_id: stored.provider_transaction_id!,
					refund_state: stored.refund_state,
				}),
				200,
			);
		},
	);
