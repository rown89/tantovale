import { and, eq, inArray, lt, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { subHours } from 'date-fns';

import { createRouter } from 'src/lib/create-app';
import { createClient } from 'src/database';
import { orders_proposals } from 'src/database/schemas/orders_proposals';
import { orders } from 'src/database/schemas/orders';
import { authPath, environment } from 'src/utils/constants';
import { TransactionSyncService } from '../payments/transaction-sync.service';
import {
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from 'src/database/schemas/enumerated_values';
import { acquireItemCommerceLock } from 'src/lib/item-commerce-lock';
import { entityTrustapTransactions, profiles } from '#db-schema';
import { PaymentProviderService } from '../payments/payment-provider.service';
import { authenticateCronSecret } from './secret-auth';

const expiredOrdersTolleranceInHours = environment.ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS;
const expiredProposalsTolleranceInHours = environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS;
const authenticateExpiredOrdersCron = authenticateCronSecret(environment.DAILY_ORDER_CHECK_SECRET_KEY);
const authenticateExpiredProposalsCron = authenticateCronSecret(environment.DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY);
const authenticateTransactionSyncCron = authenticateCronSecret(environment.TRANSACTIONS_SYNC_SECRET_KEY);
const cronSellerProfiles = alias(profiles, 'cron_seller_profiles');

export const cronRoute = createRouter()
	.get(`${authPath}/expired-orders-check`, authenticateExpiredOrdersCron, async (c) => {
		const { db } = createClient();

		// Calculate date that is orders payment tollerance hours ago from creation date
		const tolleranceDate = subHours(new Date(), expiredOrdersTolleranceInHours);

		const candidates = await db
			.select({
				id: orders.id,
				item_id: orders.item_id,
			})
			.from(orders)
			.where(
				and(
					eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
					eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
					eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.NONE),
					lt(orders.created_at, tolleranceDate),
				),
			);
		const updatedOrders: Array<{ id: number }> = [];
		const reconciliationRequired: Array<{ id: number }> = [];
		for (const candidate of candidates) {
			if (!candidate.item_id) {
				await db
					.update(orders)
					.set({
						payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
						payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
						updated_at: new Date(),
					})
					.where(eq(orders.id, candidate.id));
				reconciliationRequired.push({ id: candidate.id });
				continue;
			}
			const marked = await db.transaction(async (tx) => {
				await acquireItemCommerceLock(tx, candidate.item_id!);
				const [current] = await tx
					.select({
						id: orders.id,
						item_id: orders.item_id,
						transaction_id: orders.payment_transaction_id,
						buyer_provider_id: profiles.payment_provider_id,
						seller_provider_id: cronSellerProfiles.payment_provider_id,
						item_price: orders.item_price,
						platform_charge: orders.platform_charge,
						provider_charge: orders.payment_provider_charge,
					})
					.from(orders)
					.leftJoin(profiles, eq(orders.buyer_id, profiles.id))
					.leftJoin(cronSellerProfiles, eq(orders.seller_id, cronSellerProfiles.id))
					.where(
						and(
							eq(orders.id, candidate.id),
							eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
							eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
							eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.NONE),
							lt(orders.created_at, tolleranceDate),
						),
					);
				if (!current) return undefined;
				const [providerTransaction] = current.transaction_id
					? await tx
							.select({
								buyer_id: entityTrustapTransactions.buyerId,
								charge: entityTrustapTransactions.charge,
								charge_seller: entityTrustapTransactions.chargeSeller,
								currency: entityTrustapTransactions.currency,
								entity_id: entityTrustapTransactions.entityId,
								price: entityTrustapTransactions.price,
								quarantined: entityTrustapTransactions.quarantined,
								seller_id: entityTrustapTransactions.sellerId,
								status: entityTrustapTransactions.status,
								transaction_id: entityTrustapTransactions.transactionId,
							})
							.from(entityTrustapTransactions)
							.where(eq(entityTrustapTransactions.transactionId, current.transaction_id))
							.limit(1)
					: [];
				const graphIsCancellable =
					current.item_id === candidate.item_id &&
					current.transaction_id !== null &&
					current.buyer_provider_id !== null &&
					current.seller_provider_id !== null &&
					providerTransaction !== undefined &&
					!providerTransaction.quarantined &&
					providerTransaction.transaction_id === current.transaction_id &&
					providerTransaction.entity_id === current.item_id &&
					providerTransaction.buyer_id === current.buyer_provider_id &&
					providerTransaction.seller_id === current.seller_provider_id &&
					providerTransaction.currency === 'eur' &&
					providerTransaction.price === current.item_price + current.platform_charge &&
					providerTransaction.charge === current.provider_charge &&
					providerTransaction.charge_seller === 0 &&
					['created', 'joined'].includes(providerTransaction.status);
				if (!graphIsCancellable) {
					await tx
						.update(orders)
						.set({
							payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
							updated_at: new Date(),
						})
						.where(eq(orders.id, current.id));
					return { outcome: 'reconciliation' as const };
				}
				const transactionId = current.transaction_id!;
				const buyerProviderId = current.buyer_provider_id!;
				const [updated] = await tx
					.update(orders)
					.set({ payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLING, updated_at: new Date() })
					.where(
						and(
							eq(orders.id, candidate.id),
							eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
							eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
							eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.NONE),
							lt(orders.created_at, tolleranceDate),
						),
					)
					.returning({ id: orders.id });
				return updated
					? {
							outcome: 'marked' as const,
							buyer_provider_id: buyerProviderId,
							transaction_id: transactionId,
						}
					: undefined;
			});
			if (!marked) continue;
			if (marked.outcome === 'reconciliation') {
				reconciliationRequired.push({ id: candidate.id });
				continue;
			}

			try {
				await new PaymentProviderService().cancelGuestTransaction(marked.transaction_id, marked.buyer_provider_id);
				const finalized = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, candidate.item_id!);
					const [updated] = await tx
						.update(orders)
						.set({
							status: ORDER_PHASES.EXPIRED,
							payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(orders.id, candidate.id),
								eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
								eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
								eq(orders.payment_transaction_id, marked.transaction_id),
							),
						)
						.returning({ id: orders.id });
					if (updated) {
						const [updatedProvider] = await tx
							.update(entityTrustapTransactions)
							.set({ status: 'cancelled', updated_at: new Date() })
							.where(eq(entityTrustapTransactions.transactionId, marked.transaction_id))
							.returning({ transaction_id: entityTrustapTransactions.transactionId });
						if (!updatedProvider) throw new Error('Provider transaction graph changed during cancellation');
					}
					return updated;
				});
				if (finalized) updatedOrders.push(finalized);
				else {
					reconciliationRequired.push({ id: candidate.id });
					await db
						.update(orders)
						.set({ payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED })
						.where(eq(orders.id, candidate.id));
				}
			} catch {
				await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, candidate.item_id!);
					await tx
						.update(orders)
						.set({
							payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(orders.id, candidate.id),
								eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
							),
						);
				});
				reconciliationRequired.push({ id: candidate.id });
			}
		}

		if (!updatedOrders.length && !reconciliationRequired.length) {
			return c.json({ message: 'No orders to cancel', status: 200 }, 200);
		}

		return c.json(
			{
				orders: updatedOrders,
				reconciliation_required: reconciliationRequired,
				status: 200,
				message: updatedOrders.length ? 'Orders expired' : 'Order cancellation requires reconciliation',
			},
			200,
		);
	})
	.get(`${authPath}/expired-proposals-check`, authenticateExpiredProposalsCron, async (c) => {
		const { db } = createClient();

		// Calculate date that is proposals tollerance hours ago from creation date
		const toleranceDate = subHours(new Date(), expiredProposalsTolleranceInHours);

		const candidates = await db
			.select({ id: orders_proposals.id, item_id: orders_proposals.item_id })
			.from(orders_proposals)
			.where(
				and(eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending), lt(orders_proposals.created_at, toleranceDate)),
			);
		const updatedProposals = (
			await Promise.all(
				candidates.map(({ id, item_id }) =>
					db.transaction(async (tx) => {
						if (item_id) await acquireItemCommerceLock(tx, item_id);
						const [updated] = await tx
							.update(orders_proposals)
							.set({ status: ORDER_PROPOSAL_PHASES.expired, updated_at: new Date() })
							.where(
								and(
									eq(orders_proposals.id, id),
									eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
									lt(orders_proposals.created_at, toleranceDate),
									notExists(
										tx
											.select({ id: orders.id })
											.from(orders)
											.where(
												and(
													eq(orders.order_proposal_id, id),
													inArray(orders.payment_creation_state, [
														PAYMENT_CREATION_STATES.PREPARING,
														PAYMENT_CREATION_STATES.CREATING,
														PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
													]),
												),
											),
									),
								),
							)
							.returning({ id: orders_proposals.id });
						return updated;
					}),
				),
			)
		).filter((proposal): proposal is { id: number } => proposal !== undefined);

		if (!updatedProposals.length) return c.json({ message: 'No proposals to cancel', status: 200 }, 200);

		return c.json({ proposals: updatedProposals, status: 200, message: 'Proposals expired' }, 200);
	})
	.get(`${authPath}/sync-transactions`, authenticateTransactionSyncCron, async (c) => {
		try {
			const syncService = new TransactionSyncService();
			const result = await syncService.syncTransactionStatuses();

			return c.json(result, 200);
		} catch (error) {
			console.error('Transaction sync error:', error);
			return c.json({ error: 'Failed to sync transactions' }, 500);
		}
	});
