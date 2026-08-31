import z from 'zod/v4';
import { describeRoute } from 'hono-openapi';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { createRouter } from '#lib/create-app';
import { createClient } from '#create-client';
import { orders, shipping_label_purchases, shipping_quotes, SHIPPING_LABEL_PURCHASE_STATES } from '#db-schema';
import { ORDER_PHASES } from '#database/schemas/enumerated_values';
import { activeCarriersDescription, createLabelDescription } from './describe';
import { authPath, SHIPPING_ERROR_MESSAGES } from '#utils/constants';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { ShipmentService, ShippoProviderError } from './shipment.service';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';

const postgresIntegerMax = 2_147_483_647;
const definitelyRejectedShippoStatuses = new Set([400, 401, 403, 404, 422]);

const calculateShipmentCostSchema = z.object({
	item_id: z.number().int().positive('Item ID must be a positive integer').max(postgresIntegerMax),
});

const createLabelSchema = z.object({
	order_id: z.number().int().positive().max(postgresIntegerMax),
	rate_id: z.string().trim().min(1),
});

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
	.get(`/${authPath}/active_carriers`, authMiddleware, describeRoute(activeCarriersDescription), async (c) => {
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
		describeRoute(createLabelDescription),
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
				const [order] = await tx
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
					})
					.from(orders)
					.where(and(eq(orders.id, order_id), eq(orders.item_id, itemId), eq(orders.seller_id, user.profile_id)))
					.for('update')
					.limit(1);
				if (!order?.item_id) return { kind: 'not_found' as const };
				if (order.status !== ORDER_PHASES.PAYMENT_CONFIRMED && order.status !== ORDER_PHASES.SHIPPING_PENDING) {
					return { kind: 'wrong_state' as const };
				}

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

			const shipmentService = new ShipmentService();
			try {
				await shipmentService.verifyRateForPurchase({
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
				const [order] = await tx
					.select({ status: orders.status })
					.from(orders)
					.where(and(eq(orders.id, order_id), eq(orders.item_id, claim.itemId)))
					.for('update')
					.limit(1);
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
				if (order?.status === ORDER_PHASES.PAYMENT_CONFIRMED || order?.status === ORDER_PHASES.SHIPPING_PENDING) {
					return true;
				}
				await tx
					.update(shipping_label_purchases)
					.set({ state: SHIPPING_LABEL_PURCHASE_STATES.RECONCILIATION_REQUIRED, updated_at: new Date() })
					.where(eq(shipping_label_purchases.id, claim.purchaseId));
				return false;
			});
			if (!mayPost) return c.json({ message: 'Shipping label purchase requires reconciliation' }, 409);

			let outcome: Awaited<ReturnType<ShipmentService['purchaseVerifiedLabel']>>;
			try {
				outcome = await shipmentService.purchaseVerifiedLabel(claim.rateId);
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

			let stored;
			try {
				stored = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, claim.itemId);
					const [purchase] = await tx
						.update(shipping_label_purchases)
						.set({
							state: SHIPPING_LABEL_PURCHASE_STATES.PURCHASED,
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
	);
