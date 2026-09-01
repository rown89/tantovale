import { eq, and, inArray, lt, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { subHours } from 'date-fns';

import { createClient } from '#database/index';
import {
	chat_messages,
	chat_rooms,
	commerce_reconciliation_audit,
	entityTrustapTransactions,
	items,
	orders,
	orders_proposals,
	payment_invitation_outbox,
	profiles,
	shipping_quotes,
	users,
} from '#db-schema';
import { PaymentProviderService } from './payment-provider.service';
import {
	entityTrustapTransactionStatusValues,
	entityTrustapTransactionTypeValues,
	type EntityTrustapTransactionStatus,
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '#database/schemas/enumerated_values';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';
import {
	classifyTrustapStatusRelation,
	isAuthoritativeCancellationStatus,
	isAuthoritativeCreationResolutionStatus,
	isReachableOrSameTrustapTransition,
	isTrustapTransitionCompatibleWithTerminalOrder,
	resolveCronCancellationSettlement,
	resolveTrustapOrderTransition,
	trustapToOrderPhase,
	type TrustapOrderTransition,
} from './trustap-order-state';
import type { TrustapId } from './trustap-int64';
import { PaymentInvitationOutboxService } from './payment-invitation-outbox.service';
import type { GetTransactionStatusResponse } from './types';
import { complaintRequiresDurableReconciliation } from './complaint-reconciliation';
import {
	SHIPPING_LABEL_TRANSITION_DEFERRED,
	shippingLabelPurchaseDefersOrderTransition,
} from '#lib/shipping-label-transition-guard';

type TransactionSyncResult = {
	transactionId: TrustapId | null;
	success: boolean;
	orderId?: number;
	localAttemptId?: string;
	recovered?: boolean;
	superseded?: boolean;
	requiresManualReconciliation?: boolean;
	oldStatus?: string;
	newStatus?: string;
	error?: string;
};

function isTrustapStatus(value: string): value is EntityTrustapTransactionStatus {
	return (entityTrustapTransactionStatusValues as readonly string[]).includes(value);
}

type PollingCorrelationSnapshot = {
	id: number;
	entityId: number | null;
	transactionId: TrustapId;
	providerBuyerId: string | null;
	providerSellerId: string | null;
	providerCurrency: string;
	providerPrice: number;
	providerCharge: number;
	providerChargeSeller: number;
	orderId: number | null;
	orderItemId: number | null;
	orderItemPrice: number | null;
	orderPlatformCharge: number | null;
	orderProviderCharge: number | null;
	orderShippingPrice: number | null;
	orderAttemptId: string | null;
	buyerProviderId: string | null;
	sellerProviderId: string | null;
};

type RecoveryProviderSnapshot = {
	id: number;
	entityId: number | null;
	sellerId: string | null;
	buyerId: string | null;
	currency: string;
	price: number;
	charge: number;
	chargeSeller: number;
	quarantined: boolean;
	status: EntityTrustapTransactionStatus;
};

const durableRecoveryConflictTypes = [
	'runtime_transaction_correlation_mismatch',
	'runtime_transaction_lineage_mismatch',
	'runtime_terminal_provider_status_conflict',
	'runtime_polling_correlation_mismatch',
] as const;

function recoveryProviderImmutableSnapshotIsEqual(
	initial: RecoveryProviderSnapshot,
	current: RecoveryProviderSnapshot,
): boolean {
	return (
		initial.id === current.id &&
		initial.entityId === current.entityId &&
		initial.sellerId === current.sellerId &&
		initial.buyerId === current.buyerId &&
		initial.currency === current.currency &&
		initial.price === current.price &&
		initial.charge === current.charge &&
		initial.chargeSeller === current.chargeSeller
	);
}

function isPollingCorrelationValid(
	transaction: PollingCorrelationSnapshot,
	remote: GetTransactionStatusResponse,
): boolean {
	return (
		remote.id === transaction.transactionId &&
		transaction.entityId !== null &&
		transaction.orderId !== null &&
		transaction.orderItemId === transaction.entityId &&
		transaction.orderItemPrice !== null &&
		transaction.orderPlatformCharge !== null &&
		transaction.orderProviderCharge !== null &&
		transaction.orderShippingPrice !== null &&
		transaction.providerBuyerId !== null &&
		transaction.providerSellerId !== null &&
		transaction.buyerProviderId !== null &&
		transaction.sellerProviderId !== null &&
		transaction.providerCurrency === 'eur' &&
		transaction.providerPrice === transaction.orderItemPrice + transaction.orderPlatformCharge &&
		transaction.providerCharge === transaction.orderProviderCharge &&
		transaction.providerChargeSeller === 0 &&
		remote.buyer_id === transaction.providerBuyerId &&
		remote.seller_id === transaction.providerSellerId &&
		remote.buyer_id === transaction.buyerProviderId &&
		remote.seller_id === transaction.sellerProviderId &&
		remote.currency === transaction.providerCurrency &&
		remote.price === transaction.providerPrice &&
		remote.charge === transaction.providerCharge &&
		remote.charge_seller === transaction.providerChargeSeller &&
		(transaction.orderAttemptId === null || remote.description.includes(transaction.orderAttemptId))
	);
}

function proposalStatusForRecoveredTransaction(status: EntityTrustapTransactionStatus) {
	return ['rejected', 'cancelled'].includes(status) ? ORDER_PROPOSAL_PHASES.rejected : ORDER_PROPOSAL_PHASES.accepted;
}

function orderStatusForRecoveredTransaction(status: EntityTrustapTransactionStatus, currentStatus: string) {
	if (status === 'complained') return currentStatus;
	return trustapToOrderPhase[status as keyof typeof trustapToOrderPhase] ?? ORDER_PHASES.PAYMENT_PENDING;
}

function resolveKnownRecoveryTransition(
	currentProviderStatus: EntityTrustapTransactionStatus | undefined,
	currentOrderStatus: string,
	remoteStatus: EntityTrustapTransactionStatus,
): TrustapOrderTransition {
	if (currentProviderStatus) {
		return resolveTrustapOrderTransition(currentProviderStatus, currentOrderStatus, remoteStatus);
	}
	const orderStatus = orderStatusForRecoveredTransaction(remoteStatus, currentOrderStatus);
	return {
		apply: orderStatus !== currentOrderStatus,
		orderStatus,
		providerStatus: remoteStatus,
	};
}

function recoverySystemMessage(proposalId: number, status: EntityTrustapTransactionStatus): string {
	if (status === 'complained') {
		return `Proposal #${proposalId}, was accepted; payment is under complaint review.`;
	}
	if (status === 'cancelled_with_payment' || status === 'payment_refunded') {
		return `Proposal #${proposalId}, was accepted, but payment was refunded.`;
	}
	return proposalStatusForRecoveredTransaction(status) === ORDER_PROPOSAL_PHASES.accepted
		? `Proposal #${proposalId}, has been accepted by the seller.`
		: `Proposal #${proposalId}, was not completed by the payment provider.`;
}

export class TransactionSyncService {
	private paymentProviderService: PaymentProviderService;
	private db = createClient();

	constructor() {
		this.paymentProviderService = new PaymentProviderService();
	}

	private async recoverStalePaymentReservations(): Promise<TransactionSyncResult[]> {
		const { db } = this.db;
		const candidates = await db
			.select({
				orderId: orders.id,
				itemId: orders.item_id,
				quoteId: orders.shipping_quote_id,
				attemptId: orders.payment_attempt_id,
				creationState: orders.payment_creation_state,
			})
			.from(orders)
			.where(
				and(
					inArray(orders.payment_creation_state, [PAYMENT_CREATION_STATES.PREPARING, PAYMENT_CREATION_STATES.CREATING]),
					lt(orders.updated_at, subHours(new Date(), 1)),
				),
			);

		const results: TransactionSyncResult[] = [];
		for (const candidate of candidates) {
			if (candidate.itemId === null) continue;
			const itemId = candidate.itemId;
			const recovered = await db.transaction(async (tx) => {
				await acquireItemCommerceLock(tx, itemId);
				if (candidate.creationState === PAYMENT_CREATION_STATES.PREPARING) {
					const [deleted] = await tx
						.delete(orders)
						.where(
							and(
								eq(orders.id, candidate.orderId),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.PREPARING),
							),
						)
						.returning({ id: orders.id });
					if (!deleted) return false;
					if (candidate.quoteId) {
						await tx
							.delete(shipping_quotes)
							.where(
								and(
									eq(shipping_quotes.id, candidate.quoteId),
									notExists(
										tx
											.select({ id: orders_proposals.id })
											.from(orders_proposals)
											.where(eq(orders_proposals.shipping_quote_id, candidate.quoteId)),
									),
									notExists(
										tx.select({ id: orders.id }).from(orders).where(eq(orders.shipping_quote_id, candidate.quoteId)),
									),
								),
							);
					}
					if (candidate.attemptId) {
						await tx
							.delete(shipping_quotes)
							.where(
								and(
									eq(shipping_quotes.checkout_attempt_id, candidate.attemptId),
									notExists(
										tx
											.select({ id: orders_proposals.id })
											.from(orders_proposals)
											.where(eq(orders_proposals.shipping_quote_id, shipping_quotes.id)),
									),
									notExists(
										tx.select({ id: orders.id }).from(orders).where(eq(orders.shipping_quote_id, shipping_quotes.id)),
									),
								),
							);
					}
					return true;
				}

				const [updated] = await tx
					.update(orders)
					.set({
						payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
						updated_at: new Date(),
					})
					.where(
						and(eq(orders.id, candidate.orderId), eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATING)),
					)
					.returning({ id: orders.id });
				return Boolean(updated);
			});
			if (!recovered) continue;
			results.push(
				candidate.creationState === PAYMENT_CREATION_STATES.PREPARING
					? {
							transactionId: null,
							orderId: candidate.orderId,
							localAttemptId: candidate.attemptId ?? undefined,
							recovered: true,
							success: true,
						}
					: {
							transactionId: null,
							orderId: candidate.orderId,
							localAttemptId: candidate.attemptId ?? undefined,
							requiresManualReconciliation: true,
							success: false,
							error: 'Trustap create may have started; manual reconciliation is required',
						},
			);
		}
		return results;
	}

	private async recoverKnownTransactions(): Promise<TransactionSyncResult[]> {
		const { db } = this.db;
		const buyerProfiles = alias(profiles, 'transaction_sync_buyer_profiles');
		const sellerProfiles = alias(profiles, 'transaction_sync_seller_profiles');
		const buyerUsers = alias(users, 'transaction_sync_buyer_users');
		const sellerUsers = alias(users, 'transaction_sync_seller_users');
		const candidates = await db
			.select({
				orderId: orders.id,
				itemId: orders.item_id,
				proposalId: orders.order_proposal_id,
				paymentTransactionId: orders.payment_transaction_id,
				legacyTransactionId: orders.legacy_payment_transaction_id,
				paymentAttemptId: orders.payment_attempt_id,
				itemPrice: orders.item_price,
				platformCharge: orders.platform_charge,
				providerCharge: orders.payment_provider_charge,
				shippingPrice: orders.shipping_price,
				orderStatus: orders.status,
				paymentCancellationState: orders.payment_cancellation_state,
				itemTitle: items.title,
				buyerProfileId: orders.buyer_id,
				sellerProfileId: orders.seller_id,
				buyerAddressId: orders.buyer_address,
				sellerAddressId: orders.seller_address,
				buyerProviderId: buyerProfiles.payment_provider_id,
				sellerProviderId: sellerProfiles.payment_provider_id,
				buyerEmail: buyerUsers.email,
				sellerUsername: sellerUsers.username,
			})
			.from(orders)
			.leftJoin(items, eq(orders.item_id, items.id))
			.leftJoin(buyerProfiles, eq(orders.buyer_id, buyerProfiles.id))
			.leftJoin(sellerProfiles, eq(orders.seller_id, sellerProfiles.id))
			.leftJoin(buyerUsers, eq(buyerProfiles.user_id, buyerUsers.id))
			.leftJoin(sellerUsers, eq(sellerProfiles.user_id, sellerUsers.id))
			.where(
				and(
					eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED),
					notExists(
						db
							.select({ id: commerce_reconciliation_audit.id })
							.from(commerce_reconciliation_audit)
							.where(
								and(
									eq(commerce_reconciliation_audit.source_table, 'orders'),
									eq(commerce_reconciliation_audit.source_row_id, orders.id),
									inArray(commerce_reconciliation_audit.conflict_type, durableRecoveryConflictTypes),
								),
							),
					),
				),
			);

		const results: TransactionSyncResult[] = [];
		for (const candidate of candidates) {
			const transactionId = candidate.paymentTransactionId ?? candidate.legacyTransactionId;
			if (
				transactionId === null ||
				candidate.itemId === null ||
				candidate.itemPrice === null ||
				candidate.paymentAttemptId === null ||
				candidate.buyerProfileId === null ||
				candidate.sellerProfileId === null ||
				candidate.buyerAddressId === null ||
				candidate.sellerAddressId === null ||
				!candidate.buyerProviderId ||
				!candidate.sellerProviderId ||
				!candidate.itemTitle ||
				!candidate.buyerEmail ||
				!candidate.sellerUsername
			) {
				results.push({
					transactionId,
					orderId: candidate.orderId,
					localAttemptId: candidate.paymentAttemptId ?? undefined,
					requiresManualReconciliation: true,
					success: false,
					error:
						transactionId === null
							? 'Trustap transaction id is unknown; manual reconciliation is required'
							: 'The local recovery snapshot is incomplete',
				});
				continue;
			}
			const itemId = candidate.itemId;
			const [initialProvider] = await db
				.select({
					id: entityTrustapTransactions.id,
					entityId: entityTrustapTransactions.entityId,
					sellerId: entityTrustapTransactions.sellerId,
					buyerId: entityTrustapTransactions.buyerId,
					currency: entityTrustapTransactions.currency,
					price: entityTrustapTransactions.price,
					charge: entityTrustapTransactions.charge,
					chargeSeller: entityTrustapTransactions.chargeSeller,
					quarantined: entityTrustapTransactions.quarantined,
					status: entityTrustapTransactions.status,
				})
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId))
				.limit(1);
			if (initialProvider?.quarantined) {
				results.push({
					transactionId,
					orderId: candidate.orderId,
					requiresManualReconciliation: true,
					success: false,
					error: 'Provider evidence is quarantined; manual reconciliation is required',
				});
				continue;
			}

			try {
				// The provider request intentionally happens before opening a database transaction or taking the item lock.
				const remote = await this.paymentProviderService.getTransactionStatus(transactionId);
				if (!remote || !isTrustapStatus(remote.status)) throw new Error('Invalid Trustap transaction response');
				const remoteStatus = remote.status as EntityTrustapTransactionStatus;
				const recoveredProposalStatus = proposalStatusForRecoveredTransaction(remoteStatus);
				const recoveryOutcome = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, itemId);
					const [reservation] = await tx
						.select({
							id: orders.id,
							itemId: orders.item_id,
							paymentTransactionId: orders.payment_transaction_id,
							legacyTransactionId: orders.legacy_payment_transaction_id,
							proposalId: orders.order_proposal_id,
							orderStatus: orders.status,
							paymentCreationState: orders.payment_creation_state,
							paymentCancellationState: orders.payment_cancellation_state,
							paymentAttemptId: orders.payment_attempt_id,
							itemPrice: orders.item_price,
							platformCharge: orders.platform_charge,
							providerCharge: orders.payment_provider_charge,
							shippingPrice: orders.shipping_price,
							buyerAddressId: orders.buyer_address,
							sellerAddressId: orders.seller_address,
							buyerProfileId: orders.buyer_id,
							sellerProfileId: orders.seller_id,
							itemTitle: items.title,
							buyerProviderId: buyerProfiles.payment_provider_id,
							sellerProviderId: sellerProfiles.payment_provider_id,
							buyerEmail: buyerUsers.email,
							sellerUsername: sellerUsers.username,
						})
						.from(orders)
						.leftJoin(items, eq(orders.item_id, items.id))
						.leftJoin(buyerProfiles, eq(orders.buyer_id, buyerProfiles.id))
						.leftJoin(sellerProfiles, eq(orders.seller_id, sellerProfiles.id))
						.leftJoin(buyerUsers, eq(buyerProfiles.user_id, buyerUsers.id))
						.leftJoin(sellerUsers, eq(sellerProfiles.user_id, sellerUsers.id))
						.where(and(eq(orders.id, candidate.orderId), eq(orders.item_id, itemId)))
						.limit(1);
					if (
						!reservation ||
						(reservation.paymentTransactionId ?? reservation.legacyTransactionId) !== transactionId ||
						reservation.itemId !== itemId ||
						reservation.paymentAttemptId === null ||
						reservation.itemPrice === null ||
						reservation.buyerAddressId === null ||
						reservation.sellerAddressId === null ||
						reservation.buyerProfileId === null ||
						reservation.sellerProfileId === null ||
						!reservation.buyerProviderId ||
						!reservation.sellerProviderId ||
						!reservation.itemTitle ||
						!reservation.buyerEmail ||
						!reservation.sellerUsername
					) {
						throw new Error('The recovery reservation changed before finalization');
					}
					const [conflictingOrderReference] = await tx
						.select({ id: orders.id })
						.from(orders)
						.where(eq(orders.payment_transaction_id, transactionId))
						.limit(1);
					if (conflictingOrderReference && conflictingOrderReference.id !== reservation.id) {
						throw new Error('The Trustap transaction id belongs to another local order');
					}

					const [existingTransaction] = await tx
						.select({
							id: entityTrustapTransactions.id,
							entityId: entityTrustapTransactions.entityId,
							sellerId: entityTrustapTransactions.sellerId,
							buyerId: entityTrustapTransactions.buyerId,
							currency: entityTrustapTransactions.currency,
							price: entityTrustapTransactions.price,
							charge: entityTrustapTransactions.charge,
							chargeSeller: entityTrustapTransactions.chargeSeller,
							quarantined: entityTrustapTransactions.quarantined,
							status: entityTrustapTransactions.status,
						})
						.from(entityTrustapTransactions)
						.where(eq(entityTrustapTransactions.transactionId, transactionId))
						.limit(1)
						.for('update');
					if (existingTransaction?.quarantined) return 'quarantined' as const;
					const recoverySnapshot = {
						order: {
							id: reservation.id,
							itemId: reservation.itemId,
							proposalId: reservation.proposalId,
							paymentTransactionId: reservation.paymentTransactionId,
							legacyTransactionId: reservation.legacyTransactionId,
							orderStatus: reservation.orderStatus,
							paymentCreationState: reservation.paymentCreationState,
							paymentCancellationState: reservation.paymentCancellationState,
							paymentAttemptId: reservation.paymentAttemptId,
							itemPrice: reservation.itemPrice,
							platformCharge: reservation.platformCharge,
							providerCharge: reservation.providerCharge,
							shippingPrice: reservation.shippingPrice,
							buyerAddressId: reservation.buyerAddressId,
							sellerAddressId: reservation.sellerAddressId,
							buyerProfileId: reservation.buyerProfileId,
							sellerProfileId: reservation.sellerProfileId,
							buyerProviderId: reservation.buyerProviderId,
							sellerProviderId: reservation.sellerProviderId,
							itemTitle: reservation.itemTitle,
						},
						providerBeforeRequest: initialProvider ?? null,
						provider: existingTransaction ?? null,
						remote,
					};
					const auditRecoveryConflict = async (conflictType: (typeof durableRecoveryConflictTypes)[number]) => {
						const [existingAudit] = await tx
							.select({ id: commerce_reconciliation_audit.id })
							.from(commerce_reconciliation_audit)
							.where(
								and(
									eq(commerce_reconciliation_audit.source_table, 'orders'),
									eq(commerce_reconciliation_audit.source_row_id, reservation.id),
									inArray(commerce_reconciliation_audit.conflict_type, durableRecoveryConflictTypes),
								),
							)
							.limit(1);
						if (existingAudit) return false;
						await tx.insert(commerce_reconciliation_audit).values([
							...(existingTransaction
								? [
										{
											conflict_type: conflictType,
											source_table: 'entity_trustap_transactions',
											source_row_id: existingTransaction.id,
											canonical_row_id: reservation.id,
											original_reference: transactionId,
											snapshot: recoverySnapshot,
										},
									]
								: []),
							{
								conflict_type: conflictType,
								source_table: 'orders',
								source_row_id: reservation.id,
								canonical_row_id: existingTransaction?.id ?? null,
								original_reference: transactionId,
								snapshot: recoverySnapshot,
							},
						]);
						if (existingTransaction) {
							await tx
								.update(entityTrustapTransactions)
								.set({ quarantined: true, updated_at: new Date() })
								.where(eq(entityTrustapTransactions.id, existingTransaction.id));
						}
						return true;
					};
					if (
						(initialProvider && !existingTransaction) ||
						(initialProvider &&
							existingTransaction &&
							!recoveryProviderImmutableSnapshotIsEqual(initialProvider, existingTransaction))
					) {
						await auditRecoveryConflict('runtime_transaction_correlation_mismatch');
						return existingTransaction ? ('quarantined' as const) : ('audited' as const);
					}
					const refreshedExpectedPrice = reservation.itemPrice + reservation.platformCharge;
					if (
						remote.id !== transactionId ||
						remote.buyer_id !== reservation.buyerProviderId ||
						remote.seller_id !== reservation.sellerProviderId ||
						remote.currency !== 'eur' ||
						remote.price !== refreshedExpectedPrice ||
						remote.charge !== reservation.providerCharge ||
						remote.charge_seller !== 0 ||
						!remote.description.includes(reservation.paymentAttemptId)
					) {
						await auditRecoveryConflict('runtime_transaction_correlation_mismatch');
						return existingTransaction ? ('quarantined' as const) : ('audited' as const);
					}
					if (
						existingTransaction &&
						(existingTransaction.entityId !== itemId ||
							existingTransaction.sellerId !== remote.seller_id ||
							existingTransaction.buyerId !== remote.buyer_id ||
							existingTransaction.currency !== remote.currency ||
							existingTransaction.price !== remote.price ||
							existingTransaction.charge !== remote.charge ||
							existingTransaction.chargeSeller !== remote.charge_seller)
					) {
						await auditRecoveryConflict('runtime_transaction_correlation_mismatch');
						return 'quarantined' as const;
					}
					const recoveryTransition = resolveKnownRecoveryTransition(
						existingTransaction?.status,
						reservation.orderStatus,
						remoteStatus,
					);
					const statusRelation = existingTransaction
						? classifyTrustapStatusRelation(existingTransaction.status, remoteStatus)
						: undefined;
					if (statusRelation === 'conflict') {
						await auditRecoveryConflict('runtime_transaction_lineage_mismatch');
						return 'unreachable' as const;
					}
					const creationAlreadyResolved = reservation.paymentCreationState === PAYMENT_CREATION_STATES.CREATED;
					const cancellationRequiresSettlement =
						reservation.paymentCancellationState === PAYMENT_CANCELLATION_STATES.CANCELLING ||
						reservation.paymentCancellationState === PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED;
					if (
						creationAlreadyResolved &&
						(statusRelation === 'same' || statusRelation === 'stale') &&
						!cancellationRequiresSettlement
					) {
						return 'resolved-superseded' as const;
					}
					if (statusRelation === 'stale') {
						return 'stale' as const;
					}
					if (
						!creationAlreadyResolved &&
						reservation.paymentCreationState !== PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED
					) {
						return 'stale' as const;
					}
					if (
						!isTrustapTransitionCompatibleWithTerminalOrder(
							existingTransaction?.status ?? remoteStatus,
							reservation.orderStatus,
							remoteStatus,
							reservation.paymentCancellationState,
							recoveryTransition,
						)
					) {
						await auditRecoveryConflict('runtime_terminal_provider_status_conflict');
						return existingTransaction ? ('quarantined' as const) : ('audited' as const);
					}
					const cancellationSettlement = resolveCronCancellationSettlement(
						reservation.paymentCancellationState,
						existingTransaction?.status ?? remoteStatus,
						remoteStatus,
						recoveryTransition,
					);
					const recoveredOrderStatus = cancellationSettlement?.orderStatus ?? recoveryTransition.orderStatus;
					if (await shippingLabelPurchaseDefersOrderTransition(tx, reservation.id)) {
						return 'deferred' as const;
					}
					const complaintReconciliation = await complaintRequiresDurableReconciliation(tx, {
						orderId: reservation.id,
						providerId: existingTransaction?.id ?? null,
						transactionId,
						currentProviderStatus: existingTransaction?.status,
						incomingProviderStatus: remoteStatus,
					});
					const complaintRequiresReconciliation = complaintReconciliation.required;
					const targetCreationState = complaintRequiresReconciliation
						? PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED
						: PAYMENT_CREATION_STATES.CREATED;
					const targetCancellationState = cancellationSettlement
						? cancellationSettlement.paymentCancellationState
						: reservation.paymentCancellationState !== PAYMENT_CANCELLATION_STATES.CANCELLING &&
							  ['rejected', 'cancelled', 'cancelled_with_payment', 'payment_refunded'].includes(remoteStatus)
							? PAYMENT_CANCELLATION_STATES.CANCELLED
							: reservation.paymentCancellationState;
					const [currentProposal] =
						reservation.proposalId === null
							? []
							: await tx
									.select({ status: orders_proposals.status })
									.from(orders_proposals)
									.where(and(eq(orders_proposals.id, reservation.proposalId), eq(orders_proposals.item_id, itemId)))
									.for('update')
									.limit(1);
					if (reservation.proposalId !== null && !currentProposal) {
						throw new Error('The proposal no longer exists');
					}
					const proposalRequiresFinalization =
						reservation.proposalId !== null &&
						!creationAlreadyResolved &&
						currentProposal?.status === ORDER_PROPOSAL_PHASES.pending;
					const providerRequiresUpdate = !existingTransaction || existingTransaction.status !== remoteStatus;
					const orderRequiresUpdate =
						reservation.paymentTransactionId !== transactionId ||
						reservation.legacyTransactionId !== null ||
						reservation.paymentCreationState !== targetCreationState ||
						reservation.orderStatus !== recoveredOrderStatus ||
						reservation.paymentCancellationState !== targetCancellationState;
					if (
						complaintRequiresReconciliation &&
						!complaintReconciliation.inserted &&
						!providerRequiresUpdate &&
						!proposalRequiresFinalization &&
						!orderRequiresUpdate
					) {
						return 'pending-reconciliation' as const;
					}
					if (!existingTransaction) {
						await tx.insert(entityTrustapTransactions).values({
							entityId: itemId,
							sellerId: remote.seller_id,
							buyerId: remote.buyer_id,
							transactionId,
							transactionType: 'online_payment',
							status: remoteStatus,
							price: refreshedExpectedPrice,
							charge: reservation.providerCharge,
							chargeSeller: remote.charge_seller,
							currency: 'eur',
							entityTitle: reservation.itemTitle,
							claimedBySeller: false,
							claimedByBuyer: false,
							complaintPeriodDeadline: null,
						});
					} else if (existingTransaction.status !== remoteStatus) {
						await tx
							.update(entityTrustapTransactions)
							.set({ status: remoteStatus, updated_at: new Date() })
							.where(eq(entityTrustapTransactions.id, existingTransaction.id));
					}

					if (reservation.proposalId !== null && !creationAlreadyResolved) {
						const proposalId = reservation.proposalId;
						if (!currentProposal) throw new Error('The proposal no longer exists');
						if (currentProposal.status === ORDER_PROPOSAL_PHASES.pending) {
							await tx
								.update(orders_proposals)
								.set({ status: recoveredProposalStatus, updated_at: new Date() })
								.where(eq(orders_proposals.id, proposalId));
							const [room] = await tx
								.select({ id: chat_rooms.id })
								.from(chat_rooms)
								.where(and(eq(chat_rooms.item_id, itemId), eq(chat_rooms.buyer_id, reservation.buyerProfileId)))
								.limit(1);
							if (!room) throw new Error('The proposal chat room no longer exists');
							await tx.insert(chat_messages).values({
								chat_room_id: room.id,
								sender_id: reservation.sellerProfileId,
								message: recoverySystemMessage(proposalId, remoteStatus),
								message_type: 'system',
								metadata: {
									order_id: reservation.id,
									type:
										recoveredProposalStatus === ORDER_PROPOSAL_PHASES.accepted
											? 'proposal_accepted'
											: 'proposal_rejected',
								},
							});
							if (remoteStatus === 'created' || remoteStatus === 'joined') {
								await tx
									.insert(payment_invitation_outbox)
									.values({
										order_id: reservation.id,
										transaction_id: transactionId,
										recipient_email: reservation.buyerEmail,
										merchant_username: reservation.sellerUsername,
										item_name: reservation.itemTitle,
									})
									.onConflictDoNothing({ target: payment_invitation_outbox.order_id });
							}
						} else {
							const resolvingAcceptedComplaint =
								currentProposal.status === ORDER_PROPOSAL_PHASES.accepted &&
								existingTransaction?.status === entityTrustapTransactionTypeValues.COMPLAINED &&
								isAuthoritativeCreationResolutionStatus(remoteStatus);
							if (currentProposal.status !== recoveredProposalStatus && !resolvingAcceptedComplaint) {
								throw new Error('The proposal was finalized to a conflicting state');
							}
						}
					}

					if (orderRequiresUpdate) {
						const [recoveredOrder] = await tx
							.update(orders)
							.set({
								payment_transaction_id: transactionId,
								legacy_payment_transaction_id: null,
								payment_creation_state: targetCreationState,
								status: recoveredOrderStatus,
								payment_cancellation_state: targetCancellationState,
								updated_at: new Date(),
							})
							.where(
								and(eq(orders.id, reservation.id), eq(orders.payment_creation_state, reservation.paymentCreationState)),
							)
							.returning({ id: orders.id });
						if (!recoveredOrder) throw new Error('The order recovery state changed before finalization');
					}
					if (complaintRequiresReconciliation) {
						return 'pending-reconciliation' as const;
					}
					return creationAlreadyResolved
						? {
								outcome: 'advanced-resolved' as const,
								oldStatus: existingTransaction?.status ?? remoteStatus,
								newStatus: remoteStatus,
							}
						: ('recovered' as const);
				});
				if (recoveryOutcome === 'quarantined') {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						requiresManualReconciliation: true,
						success: false,
						error: 'Existing provider evidence conflicts with the durable local and remote snapshots',
					});
					continue;
				}
				if (recoveryOutcome === 'audited') {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						requiresManualReconciliation: true,
						success: false,
						error: 'Trustap transaction does not match the durable local snapshot',
					});
					continue;
				}
				if (recoveryOutcome === 'unreachable') {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						requiresManualReconciliation: true,
						success: false,
						error: 'Trustap transaction status is outside the persisted provider lineage',
					});
					continue;
				}
				if (recoveryOutcome === 'resolved-superseded') {
					results.push({ transactionId, orderId: candidate.orderId, success: true, superseded: true });
					continue;
				}
				if (recoveryOutcome === 'stale') {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						success: false,
						error: 'Provider response was superseded by newer durable evidence; retry later',
					});
					continue;
				}
				if (recoveryOutcome === 'deferred') {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						success: false,
						error: SHIPPING_LABEL_TRANSITION_DEFERRED,
					});
					continue;
				}
				if (recoveryOutcome === 'pending-reconciliation') {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						requiresManualReconciliation: true,
						success: false,
						error: 'Trustap complaint requires authoritative reconciliation',
					});
					continue;
				}
				if (typeof recoveryOutcome === 'object' && recoveryOutcome.outcome === 'advanced-resolved') {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						oldStatus: recoveryOutcome.oldStatus,
						newStatus: recoveryOutcome.newStatus,
						recovered: true,
						success: true,
					});
					continue;
				}
				results.push({ transactionId, orderId: candidate.orderId, recovered: true, success: true });
			} catch (error) {
				results.push({
					transactionId,
					orderId: candidate.orderId,
					requiresManualReconciliation: true,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown recovery error',
				});
			}
		}

		return results;
	}

	private async applyPolledTransaction(
		initial: PollingCorrelationSnapshot,
		remote: GetTransactionStatusResponse,
	): Promise<
		| { outcome: 'deferred' | 'ignored' | 'quarantined' }
		| { outcome: 'updated'; oldStatus: EntityTrustapTransactionStatus; newStatus: EntityTrustapTransactionStatus }
	> {
		const { db } = this.db;
		if (!isTrustapStatus(remote.status)) throw new Error('Unknown Trustap transaction status');
		const remoteStatus = remote.status;
		return db.transaction(async (tx) => {
			const itemIds = [
				...new Set([initial.entityId, initial.orderItemId].filter((id): id is number => id !== null)),
			].sort((left, right) => left - right);
			for (const itemId of itemIds) await acquireItemCommerceLock(tx, itemId);

			const [lockedProvider] = await tx
				.select({ id: entityTrustapTransactions.id, quarantined: entityTrustapTransactions.quarantined })
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.id, initial.id))
				.for('update')
				.limit(1);
			if (!lockedProvider || lockedProvider.quarantined) return { outcome: 'ignored' };

			if (initial.orderId !== null) {
				await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, initial.orderId)).for('update').limit(1);
			}

			const buyerProfiles = alias(profiles, 'poll_mismatch_buyer_profiles');
			const sellerProfiles = alias(profiles, 'poll_mismatch_seller_profiles');
			const [current] = await tx
				.select({
					id: entityTrustapTransactions.id,
					entityId: entityTrustapTransactions.entityId,
					transactionId: entityTrustapTransactions.transactionId,
					status: entityTrustapTransactions.status,
					providerBuyerId: entityTrustapTransactions.buyerId,
					providerSellerId: entityTrustapTransactions.sellerId,
					providerCurrency: entityTrustapTransactions.currency,
					providerPrice: entityTrustapTransactions.price,
					providerCharge: entityTrustapTransactions.charge,
					providerChargeSeller: entityTrustapTransactions.chargeSeller,
					orderId: orders.id,
					orderItemId: orders.item_id,
					orderStatus: orders.status,
					orderCreationState: orders.payment_creation_state,
					orderCancellationState: orders.payment_cancellation_state,
					orderProposalId: orders.order_proposal_id,
					orderItemPrice: orders.item_price,
					orderPlatformCharge: orders.platform_charge,
					orderProviderCharge: orders.payment_provider_charge,
					orderShippingPrice: orders.shipping_price,
					orderAttemptId: orders.payment_attempt_id,
					buyerProviderId: buyerProfiles.payment_provider_id,
					sellerProviderId: sellerProfiles.payment_provider_id,
				})
				.from(entityTrustapTransactions)
				.leftJoin(orders, eq(orders.payment_transaction_id, entityTrustapTransactions.transactionId))
				.leftJoin(buyerProfiles, eq(orders.buyer_id, buyerProfiles.id))
				.leftJoin(sellerProfiles, eq(orders.seller_id, sellerProfiles.id))
				.where(eq(entityTrustapTransactions.id, initial.id))
				.limit(1);
			if (!current) return { outcome: 'ignored' };

			if (!isPollingCorrelationValid(current, remote)) {
				await tx.insert(commerce_reconciliation_audit).values([
					{
						conflict_type: 'runtime_polling_correlation_mismatch',
						source_table: 'entity_trustap_transactions',
						source_row_id: current.id,
						canonical_row_id: current.orderId,
						original_reference: current.transactionId,
						snapshot: { local: current, remote },
					},
					...(current.orderId === null
						? []
						: [
								{
									conflict_type: 'runtime_polling_correlation_mismatch',
									source_table: 'orders',
									source_row_id: current.orderId,
									canonical_row_id: current.id,
									original_reference: current.transactionId,
									snapshot: { local: current, remote },
								},
							]),
				]);
				await tx
					.update(entityTrustapTransactions)
					.set({ quarantined: true, updated_at: new Date() })
					.where(eq(entityTrustapTransactions.id, current.id));
				if (current.orderId !== null) {
					await tx
						.update(orders)
						.set({
							payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
							updated_at: new Date(),
						})
						.where(eq(orders.id, current.orderId));
				}
				return { outcome: 'quarantined' };
			}

			if (current.entityId === null || current.orderId === null || current.orderStatus === null) {
				throw new Error('Trustap transaction lost its local graph after correlation');
			}
			const [linkedProposal] =
				current.orderProposalId === null
					? []
					: await tx
							.select({ status: orders_proposals.status })
							.from(orders_proposals)
							.where(eq(orders_proposals.id, current.orderProposalId))
							.for('update')
							.limit(1);
			const linkedProposalIsPending = linkedProposal?.status === ORDER_PROPOSAL_PHASES.pending;
			const transition = resolveTrustapOrderTransition(current.status, current.orderStatus, remoteStatus);
			const providerLineageApplies = isReachableOrSameTrustapTransition(current.status, remoteStatus, transition);
			if (!providerLineageApplies) return { outcome: 'ignored' };
			if (
				!isTrustapTransitionCompatibleWithTerminalOrder(
					current.status,
					current.orderStatus,
					remoteStatus,
					current.orderCancellationState,
					transition,
				)
			) {
				const snapshot = { local: current, remote };
				await tx.insert(commerce_reconciliation_audit).values([
					{
						conflict_type: 'runtime_terminal_provider_status_conflict',
						source_table: 'entity_trustap_transactions',
						source_row_id: current.id,
						canonical_row_id: current.orderId,
						original_reference: current.transactionId,
						snapshot,
					},
					{
						conflict_type: 'runtime_terminal_provider_status_conflict',
						source_table: 'orders',
						source_row_id: current.orderId,
						canonical_row_id: current.id,
						original_reference: current.transactionId,
						snapshot,
					},
				]);
				await tx
					.update(entityTrustapTransactions)
					.set({ quarantined: true, updated_at: new Date() })
					.where(eq(entityTrustapTransactions.id, current.id));
				return { outcome: 'quarantined' };
			}
			const cancellationSettlement = resolveCronCancellationSettlement(
				current.orderCancellationState,
				current.status,
				remoteStatus,
				transition,
			);
			const resolvesCreationReconciliation =
				current.orderCreationState === PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED &&
				isAuthoritativeCreationResolutionStatus(remoteStatus) &&
				!linkedProposalIsPending;
			const mayMutateOrderState =
				transition.apply ||
				Boolean(cancellationSettlement) ||
				remoteStatus === entityTrustapTransactionTypeValues.COMPLAINED ||
				resolvesCreationReconciliation;
			if (mayMutateOrderState && (await shippingLabelPurchaseDefersOrderTransition(tx, current.orderId))) {
				return { outcome: 'deferred' };
			}
			const complaintReconciliation = await complaintRequiresDurableReconciliation(tx, {
				orderId: current.orderId,
				providerId: current.id,
				transactionId: current.transactionId,
				currentProviderStatus: current.status,
				incomingProviderStatus: remoteStatus,
			});
			const complaintRequiresReconciliation = complaintReconciliation.required;
			if (
				!transition.apply &&
				!cancellationSettlement &&
				!complaintReconciliation.inserted &&
				!(
					complaintRequiresReconciliation &&
					current.orderCreationState !== PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED
				) &&
				!resolvesCreationReconciliation
			) {
				return { outcome: 'ignored' };
			}
			const updatedAt = new Date();
			if (transition.apply) {
				await tx
					.update(entityTrustapTransactions)
					.set({ status: transition.providerStatus, updated_at: updatedAt })
					.where(eq(entityTrustapTransactions.id, current.id));
			}
			await tx
				.update(orders)
				.set({
					status: cancellationSettlement?.orderStatus ?? transition.orderStatus,
					...(remoteStatus === entityTrustapTransactionTypeValues.COMPLAINED
						? { payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED }
						: resolvesCreationReconciliation
							? { payment_creation_state: PAYMENT_CREATION_STATES.CREATED }
							: {}),
					...(cancellationSettlement
						? { payment_cancellation_state: cancellationSettlement.paymentCancellationState }
						: current.orderCancellationState !== PAYMENT_CANCELLATION_STATES.CANCELLING &&
							  isAuthoritativeCancellationStatus(remoteStatus)
							? { payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED }
							: {}),
					updated_at: updatedAt,
				})
				.where(eq(orders.id, current.orderId));
			return { outcome: 'updated', oldStatus: current.status, newStatus: transition.providerStatus };
		});
	}

	/**
	 * Sync transaction statuses with Trustap
	 * This method can be called periodically to ensure our database is in sync
	 */
	async syncTransactionStatuses() {
		const { db } = this.db;

		try {
			const recoveryResults = await this.recoverKnownTransactions();
			const staleReservationResults = await this.recoverStalePaymentReservations();
			const pollBuyerProfiles = alias(profiles, 'poll_buyer_profiles');
			const pollSellerProfiles = alias(profiles, 'poll_seller_profiles');
			const staleTransactions = await db
				.select({
					id: entityTrustapTransactions.id,
					entityId: entityTrustapTransactions.entityId,
					transactionId: entityTrustapTransactions.transactionId,
					status: entityTrustapTransactions.status,
					providerBuyerId: entityTrustapTransactions.buyerId,
					providerSellerId: entityTrustapTransactions.sellerId,
					providerCurrency: entityTrustapTransactions.currency,
					providerPrice: entityTrustapTransactions.price,
					providerCharge: entityTrustapTransactions.charge,
					providerChargeSeller: entityTrustapTransactions.chargeSeller,
					updated_at: entityTrustapTransactions.updated_at,
					orderId: orders.id,
					orderItemId: orders.item_id,
					orderStatus: orders.status,
					orderCreationState: orders.payment_creation_state,
					orderCancellationState: orders.payment_cancellation_state,
					orderItemPrice: orders.item_price,
					orderPlatformCharge: orders.platform_charge,
					orderProviderCharge: orders.payment_provider_charge,
					orderShippingPrice: orders.shipping_price,
					orderAttemptId: orders.payment_attempt_id,
					buyerProviderId: pollBuyerProfiles.payment_provider_id,
					sellerProviderId: pollSellerProfiles.payment_provider_id,
				})
				.from(entityTrustapTransactions)
				.leftJoin(orders, eq(orders.payment_transaction_id, entityTrustapTransactions.transactionId))
				.leftJoin(pollBuyerProfiles, eq(orders.buyer_id, pollBuyerProfiles.id))
				.leftJoin(pollSellerProfiles, eq(orders.seller_id, pollSellerProfiles.id))
				.where(
					and(
						eq(entityTrustapTransactions.quarantined, false),
						lt(entityTrustapTransactions.updated_at, subHours(new Date(), 1)),
					),
				);
			const syncResults: TransactionSyncResult[] = [...recoveryResults, ...staleReservationResults];

			for (const transaction of staleTransactions) {
				try {
					// Provider I/O must never hold a database transaction or the item commerce lock.
					const trustapStatus = await this.paymentProviderService.getTransactionStatus(transaction.transactionId);
					if (!trustapStatus) {
						console.warn(`Could not get status for transaction ${transaction.transactionId}`);
						continue;
					}
					if (!isTrustapStatus(trustapStatus.status)) {
						throw new Error('Unknown Trustap transaction status');
					}
					const outcome = await this.applyPolledTransaction(transaction, trustapStatus);
					if (outcome.outcome === 'quarantined') {
						throw new Error('Trustap transaction is not correlated to one local order and item');
					}
					if (outcome.outcome === 'deferred') {
						syncResults.push({
							transactionId: transaction.transactionId,
							error: SHIPPING_LABEL_TRANSITION_DEFERRED,
							success: false,
						});
						continue;
					}
					if (outcome.outcome === 'updated') {
						syncResults.push({
							transactionId: transaction.transactionId,
							oldStatus: outcome.oldStatus,
							newStatus: outcome.newStatus,
							success: true,
						});
						console.log(`Synced transaction ${transaction.transactionId}: ${outcome.oldStatus} → ${outcome.newStatus}`);
					}
				} catch (error) {
					console.error(`Error syncing transaction ${transaction.transactionId}:`, error);
					syncResults.push({
						transactionId: transaction.transactionId,
						error: error instanceof Error ? error.message : 'Unknown error',
						success: false,
					});
				}
			}
			// Drain invitations only after provider polling has had the opportunity to make stale orders nonpayable.
			await new PaymentInvitationOutboxService().dispatchPending();

			return {
				totalTransactions: staleTransactions.length + recoveryResults.length + staleReservationResults.length,
				syncedTransactions: syncResults.filter((r) => r.success).length,
				failedTransactions: syncResults.filter((r) => !r.success).length,
				results: syncResults,
			};
		} catch (error) {
			console.error('Error in transaction sync:', error);
			throw error;
		}
	}

	/**
	 * Get transaction details with current status
	 */
	async getTransactionDetails(transactionId: TrustapId) {
		const { db } = this.db;

		const [transaction] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId))
			.limit(1);

		if (!transaction) {
			throw new Error('Transaction not found');
		}

		// Get current status from Trustap
		const trustapStatus = await this.paymentProviderService.getTransactionStatus(transactionId);

		return {
			local: transaction,
			trustap: trustapStatus,
			isInSync: transaction.status === trustapStatus?.status,
		};
	}
}
