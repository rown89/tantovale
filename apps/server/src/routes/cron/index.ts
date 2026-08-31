import { and, eq, inArray, isNull, lt, notExists } from 'drizzle-orm';
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
import { isAuthoritativeCancellationStatus, resolveTrustapOrderTransition } from '../payments/trustap-order-state';
import { authenticateCronSecret } from './secret-auth';

const expiredOrdersTolleranceInHours = environment.ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS;
const expiredProposalsTolleranceInHours = environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS;
const authenticateExpiredOrdersCron = authenticateCronSecret(environment.DAILY_ORDER_CHECK_SECRET_KEY);
const authenticateExpiredProposalsCron = authenticateCronSecret(environment.DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY);
const authenticateTransactionSyncCron = authenticateCronSecret(environment.TRANSACTIONS_SYNC_SECRET_KEY);
const cronSellerProfiles = alias(profiles, 'cron_seller_profiles');
// A cancellation remains in-flight for two complete provider timeout windows. Once
// this strict lease expires, its unknown remote outcome must be reconciled and
// must never be retried automatically.
const cancellationLeaseMilliseconds = environment.PROVIDER_REQUEST_TIMEOUT_MS * 2;

function expectedTrustapDescription(entityTitle: string, proposalId: number | null, paymentAttemptId: string): string {
	return proposalId === null
		? `Transaction for ${entityTitle} - (Buy Now, ref ${paymentAttemptId})`
		: `Transaction for ${entityTitle} - (Proposal #${proposalId}, ref ${paymentAttemptId})`;
}

export const cronRoute = createRouter()
	.get(`${authPath}/expired-orders-check`, authenticateExpiredOrdersCron, async (c) => {
		const { db } = createClient();

		// Calculate date that is orders payment tollerance hours ago from creation date
		const tolleranceDate = subHours(new Date(), expiredOrdersTolleranceInHours);
		const cancellationLeaseCutoff = new Date(Date.now() - cancellationLeaseMilliseconds);
		const reconciliationRequired: Array<{ id: number }> = [];
		const staleCancellationClaims = await db
			.select({ id: orders.id, item_id: orders.item_id })
			.from(orders)
			.where(
				and(
					eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
					eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
					eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
					lt(orders.updated_at, cancellationLeaseCutoff),
				),
			);
		for (const claim of staleCancellationClaims) {
			const reconciled = await db.transaction(async (tx) => {
				if (claim.item_id) await acquireItemCommerceLock(tx, claim.item_id);
				const [updated] = await tx
					.update(orders)
					.set({
						payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
						updated_at: new Date(),
					})
					.where(
						and(
							eq(orders.id, claim.id),
							claim.item_id ? eq(orders.item_id, claim.item_id) : isNull(orders.item_id),
							eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
							eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
							eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
							lt(orders.updated_at, cancellationLeaseCutoff),
						),
					)
					.returning({ id: orders.id });
				return updated;
			});
			if (reconciled) reconciliationRequired.push(reconciled);
		}

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
		const supersededCancellations: Array<{ id: number }> = [];
		for (const candidate of candidates) {
			if (!candidate.item_id) {
				const [reconciled] = await db
					.update(orders)
					.set({
						payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
						payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
						updated_at: new Date(),
					})
					.where(
						and(
							eq(orders.id, candidate.id),
							isNull(orders.item_id),
							eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
							eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
							eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.NONE),
							lt(orders.created_at, tolleranceDate),
						),
					)
					.returning({ id: orders.id });
				if (reconciled) reconciliationRequired.push(reconciled);
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
						order_proposal_id: orders.order_proposal_id,
						payment_attempt_id: orders.payment_attempt_id,
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
								entity_title: entityTrustapTransactions.entityTitle,
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
					current.payment_attempt_id !== null &&
					providerTransaction.entity_title.length > 0 &&
					['created', 'joined'].includes(providerTransaction.status);
				if (!graphIsCancellable) {
					await tx
						.update(orders)
						.set({
							payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(orders.id, current.id),
								eq(orders.item_id, candidate.item_id!),
								eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
								eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.NONE),
								lt(orders.created_at, tolleranceDate),
							),
						);
					return { outcome: 'reconciliation' as const };
				}
				const transactionId = current.transaction_id!;
				const buyerProviderId = current.buyer_provider_id!;
				const paymentAttemptId = current.payment_attempt_id!;
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
							provider_snapshot: {
								acting_provider_user_id: buyerProviderId,
								buyer_id: providerTransaction!.buyer_id!,
								charge: providerTransaction!.charge,
								charge_seller: providerTransaction!.charge_seller,
								currency: 'eur' as const,
								entity_title: providerTransaction!.entity_title,
								description: expectedTrustapDescription(
									providerTransaction!.entity_title,
									current.order_proposal_id,
									paymentAttemptId,
								),
								price: providerTransaction!.price,
								seller_id: providerTransaction!.seller_id!,
								transaction_id: transactionId,
							},
						}
					: undefined;
			});
			if (!marked) continue;
			if (marked.outcome === 'reconciliation') {
				reconciliationRequired.push({ id: candidate.id });
				continue;
			}

			const settleCancellationAttempt = async (remoteCancellationConfirmed: boolean) =>
				db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, candidate.item_id!);
					const [current] = await tx
						.select({
							id: orders.id,
							item_id: orders.item_id,
							status: orders.status,
							payment_creation_state: orders.payment_creation_state,
							payment_cancellation_state: orders.payment_cancellation_state,
							payment_transaction_id: orders.payment_transaction_id,
							buyer_provider_id: profiles.payment_provider_id,
							seller_provider_id: cronSellerProfiles.payment_provider_id,
							provider_buyer_id: entityTrustapTransactions.buyerId,
							provider_seller_id: entityTrustapTransactions.sellerId,
							provider_entity_id: entityTrustapTransactions.entityId,
							provider_entity_title: entityTrustapTransactions.entityTitle,
							provider_price: entityTrustapTransactions.price,
							provider_charge: entityTrustapTransactions.charge,
							provider_charge_seller: entityTrustapTransactions.chargeSeller,
							provider_currency: entityTrustapTransactions.currency,
							provider_quarantined: entityTrustapTransactions.quarantined,
							provider_status: entityTrustapTransactions.status,
						})
						.from(orders)
						.leftJoin(profiles, eq(orders.buyer_id, profiles.id))
						.leftJoin(cronSellerProfiles, eq(orders.seller_id, cronSellerProfiles.id))
						.leftJoin(
							entityTrustapTransactions,
							eq(entityTrustapTransactions.transactionId, orders.payment_transaction_id),
						)
						.where(eq(orders.id, candidate.id));
					const graphMatchesSnapshot =
						current?.item_id === candidate.item_id &&
						current.payment_transaction_id === marked.provider_snapshot.transaction_id &&
						current.buyer_provider_id === marked.provider_snapshot.buyer_id &&
						current.seller_provider_id === marked.provider_snapshot.seller_id &&
						current.provider_buyer_id === marked.provider_snapshot.buyer_id &&
						current.provider_seller_id === marked.provider_snapshot.seller_id &&
						current.provider_entity_id === candidate.item_id &&
						current.provider_entity_title === marked.provider_snapshot.entity_title &&
						current.provider_price === marked.provider_snapshot.price &&
						current.provider_charge === marked.provider_snapshot.charge &&
						current.provider_charge_seller === marked.provider_snapshot.charge_seller &&
						current.provider_currency === marked.provider_snapshot.currency &&
						current.provider_quarantined === false;
					if (
						graphMatchesSnapshot &&
						(current?.status === ORDER_PHASES.CANCELLED || current?.status === ORDER_PHASES.EXPIRED) &&
						current.payment_creation_state === PAYMENT_CREATION_STATES.CREATED &&
						current.payment_cancellation_state === PAYMENT_CANCELLATION_STATES.CANCELLED &&
						current.payment_transaction_id === marked.provider_snapshot.transaction_id &&
						current.provider_status === 'cancelled'
					) {
						if (current.status === ORDER_PHASES.EXPIRED) {
							return { outcome: 'cancelled' as const, order: { id: current.id } };
						}
						const [normalized] = await tx
							.update(orders)
							.set({ status: ORDER_PHASES.EXPIRED, updated_at: new Date() })
							.where(
								and(
									eq(orders.id, current.id),
									eq(orders.item_id, candidate.item_id!),
									eq(orders.status, ORDER_PHASES.CANCELLED),
									eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
									eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLED),
									eq(orders.payment_transaction_id, marked.provider_snapshot.transaction_id),
								),
							)
							.returning({ id: orders.id });
						return normalized ? { outcome: 'cancelled' as const, order: normalized } : undefined;
					}
					const providerAdvanced =
						graphMatchesSnapshot &&
						current !== undefined &&
						current.provider_status !== null &&
						current.provider_status !== 'created' &&
						current.provider_status !== 'joined';
					const repeatedTransition = providerAdvanced
						? resolveTrustapOrderTransition(current.provider_status!, current.status, current.provider_status!)
						: undefined;
					if (
						providerAdvanced &&
						current !== undefined &&
						current.provider_status !== null &&
						repeatedTransition !== undefined &&
						!repeatedTransition.apply &&
						repeatedTransition.orderStatus === current.status
					) {
						const resolvedCancellationState = isAuthoritativeCancellationStatus(current.provider_status)
							? PAYMENT_CANCELLATION_STATES.CANCELLED
							: PAYMENT_CANCELLATION_STATES.NONE;
						if (current.payment_cancellation_state === resolvedCancellationState) {
							return { outcome: 'superseded' as const, order: { id: current.id } };
						}
						if (current.payment_cancellation_state === PAYMENT_CANCELLATION_STATES.CANCELLING) {
							const [settled] = await tx
								.update(orders)
								.set({ payment_cancellation_state: resolvedCancellationState, updated_at: new Date() })
								.where(
									and(
										eq(orders.id, current.id),
										eq(orders.item_id, candidate.item_id!),
										eq(orders.status, current.status),
										eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
										eq(orders.payment_transaction_id, marked.provider_snapshot.transaction_id),
									),
								)
								.returning({ id: orders.id });
							return settled ? { outcome: 'superseded' as const, order: settled } : undefined;
						}
					}
					if (
						!remoteCancellationConfirmed ||
						!graphMatchesSnapshot ||
						current === undefined ||
						current.status !== ORDER_PHASES.PAYMENT_PENDING ||
						current.payment_creation_state !== PAYMENT_CREATION_STATES.CREATED ||
						current.payment_cancellation_state !== PAYMENT_CANCELLATION_STATES.CANCELLING ||
						(current.provider_status !== 'created' && current.provider_status !== 'joined')
					) {
						const [reconciled] = await tx
							.update(orders)
							.set({
								payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
								updated_at: new Date(),
							})
							.where(
								and(
									eq(orders.id, candidate.id),
									eq(orders.item_id, candidate.item_id!),
									eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
									eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
									eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
									eq(orders.payment_transaction_id, marked.provider_snapshot.transaction_id),
								),
							)
							.returning({ id: orders.id });
						return reconciled ? { outcome: 'reconciliation' as const } : undefined;
					}
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
								eq(orders.item_id, candidate.item_id!),
								eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
								eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
								eq(orders.payment_transaction_id, marked.provider_snapshot.transaction_id),
							),
						)
						.returning({ id: orders.id });
					if (updated) {
						const [updatedProvider] = await tx
							.update(entityTrustapTransactions)
							.set({ status: 'cancelled', updated_at: new Date() })
							.where(
								and(
									eq(entityTrustapTransactions.transactionId, marked.provider_snapshot.transaction_id),
									inArray(entityTrustapTransactions.status, ['created', 'joined']),
									eq(entityTrustapTransactions.entityId, candidate.item_id!),
									eq(entityTrustapTransactions.buyerId, marked.provider_snapshot.buyer_id),
									eq(entityTrustapTransactions.sellerId, marked.provider_snapshot.seller_id),
									eq(entityTrustapTransactions.entityTitle, marked.provider_snapshot.entity_title),
									eq(entityTrustapTransactions.price, marked.provider_snapshot.price),
									eq(entityTrustapTransactions.charge, marked.provider_snapshot.charge),
									eq(entityTrustapTransactions.chargeSeller, marked.provider_snapshot.charge_seller),
									eq(entityTrustapTransactions.currency, marked.provider_snapshot.currency),
								),
							)
							.returning({ transaction_id: entityTrustapTransactions.transactionId });
						if (!updatedProvider) throw new Error('Provider transaction graph changed during cancellation');
					}
					if (updated) return { outcome: 'cancelled' as const, order: updated };
					const [reconciled] = await tx
						.update(orders)
						.set({
							payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
							updated_at: new Date(),
						})
						.where(
							and(
								eq(orders.id, candidate.id),
								eq(orders.item_id, candidate.item_id!),
								eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
								eq(orders.payment_cancellation_state, PAYMENT_CANCELLATION_STATES.CANCELLING),
								eq(orders.payment_transaction_id, marked.provider_snapshot.transaction_id),
							),
						)
						.returning({ id: orders.id });
					return reconciled ? { outcome: 'reconciliation' as const } : undefined;
				});
			let remoteCancellationConfirmed = false;
			try {
				await new PaymentProviderService().cancelGuestTransaction(marked.provider_snapshot);
				remoteCancellationConfirmed = true;
			} catch {
				// The exact locked graph below decides whether a concurrent provider update won
				// or this ambiguous request must remain blocked for reconciliation.
			}
			let finalized;
			try {
				finalized = await settleCancellationAttempt(remoteCancellationConfirmed);
			} catch {
				finalized = await settleCancellationAttempt(false);
			}
			if (finalized?.outcome === 'cancelled') updatedOrders.push(finalized.order);
			else if (finalized?.outcome === 'superseded') supersededCancellations.push(finalized.order);
			else if (finalized?.outcome === 'reconciliation') {
				reconciliationRequired.push({ id: candidate.id });
			}
		}

		if (!updatedOrders.length && !reconciliationRequired.length && !supersededCancellations.length) {
			return c.json({ message: 'No orders to cancel', status: 200 }, 200);
		}
		const outcomeClassCount = [updatedOrders, reconciliationRequired, supersededCancellations].filter(
			(outcomes) => outcomes.length > 0,
		).length;

		return c.json(
			{
				orders: updatedOrders,
				reconciliation_required: reconciliationRequired,
				cancellation_superseded: supersededCancellations,
				status: 200,
				message:
					outcomeClassCount > 1
						? 'Order expiry processing completed'
						: updatedOrders.length
							? 'Orders expired'
							: supersededCancellations.length
								? 'Order cancellation superseded by provider state'
								: 'Order cancellation requires reconciliation',
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
