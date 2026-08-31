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
	isAuthoritativeCancellationStatus,
	isAuthoritativeCreationResolutionStatus,
	resolveTrustapOrderTransition,
	trustapToOrderPhase,
} from './trustap-order-state';
import type { TrustapId } from './trustap-int64';
import { PaymentInvitationOutboxService } from './payment-invitation-outbox.service';
import type { GetTransactionStatusResponse } from './types';
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
			.where(eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED));

		const results: TransactionSyncResult[] = [];
		for (const candidate of candidates) {
			const transactionId = candidate.paymentTransactionId ?? candidate.legacyTransactionId;
			if (candidate.orderStatus !== ORDER_PHASES.PAYMENT_PENDING) {
				results.push({
					transactionId,
					orderId: candidate.orderId,
					localAttemptId: candidate.paymentAttemptId ?? undefined,
					requiresManualReconciliation: true,
					success: false,
					error: 'A terminal order cannot be reopened automatically',
				});
				continue;
			}
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
			const itemPrice = candidate.itemPrice;
			const buyerProfileId = candidate.buyerProfileId;
			const sellerProfileId = candidate.sellerProfileId;
			const buyerProviderId = candidate.buyerProviderId;
			const sellerProviderId = candidate.sellerProviderId;
			const itemTitle = candidate.itemTitle;
			const buyerEmail = candidate.buyerEmail;
			const sellerUsername = candidate.sellerUsername;

			try {
				// The provider request intentionally happens before opening a database transaction or taking the item lock.
				const remote = await this.paymentProviderService.getTransactionStatus(transactionId);
				const expectedPrice = itemPrice + candidate.platformCharge;
				if (
					!remote ||
					remote.id !== transactionId ||
					remote.buyer_id !== buyerProviderId ||
					remote.seller_id !== sellerProviderId ||
					remote.currency !== 'eur' ||
					remote.price !== expectedPrice ||
					remote.charge !== candidate.providerCharge ||
					remote.charge_seller !== 0 ||
					!remote.description.includes(candidate.paymentAttemptId) ||
					!isTrustapStatus(remote.status)
				) {
					results.push({
						transactionId,
						orderId: candidate.orderId,
						requiresManualReconciliation: true,
						success: false,
						error: 'Trustap transaction does not match the durable local snapshot',
					});
					continue;
				}
				const remoteStatus = remote.status as EntityTrustapTransactionStatus;
				const recoveredOrderStatus = orderStatusForRecoveredTransaction(remoteStatus, candidate.orderStatus);
				const recoveredProposalStatus = proposalStatusForRecoveredTransaction(remoteStatus);
				const recoveryOutcome = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, itemId);
					const [reservation] = await tx
						.select({
							id: orders.id,
							paymentTransactionId: orders.payment_transaction_id,
							legacyTransactionId: orders.legacy_payment_transaction_id,
							proposalId: orders.order_proposal_id,
							buyerProfileId: orders.buyer_id,
							sellerProfileId: orders.seller_id,
						})
						.from(orders)
						.where(
							and(
								eq(orders.id, candidate.orderId),
								eq(orders.item_id, itemId),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED),
							),
						)
						.limit(1);
					if (
						!reservation ||
						(reservation.paymentTransactionId ?? reservation.legacyTransactionId) !== transactionId ||
						reservation.buyerProfileId === null ||
						reservation.sellerProfileId === null
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
						await tx.insert(commerce_reconciliation_audit).values([
							{
								conflict_type: 'runtime_transaction_correlation_mismatch',
								source_table: 'entity_trustap_transactions',
								source_row_id: existingTransaction.id,
								canonical_row_id: reservation.id,
								original_reference: transactionId,
								snapshot: { localProvider: existingTransaction, remote },
							},
							{
								conflict_type: 'runtime_transaction_correlation_mismatch',
								source_table: 'orders',
								source_row_id: reservation.id,
								canonical_row_id: existingTransaction.id,
								original_reference: transactionId,
								snapshot: {
									itemId,
									buyerProfileId,
									sellerProfileId,
									itemPrice,
									platformCharge: candidate.platformCharge,
									providerCharge: candidate.providerCharge,
									shippingPrice: candidate.shippingPrice,
								},
							},
						]);
						await tx
							.update(entityTrustapTransactions)
							.set({ quarantined: true, updated_at: new Date() })
							.where(eq(entityTrustapTransactions.id, existingTransaction.id));
						return 'quarantined' as const;
					}
					if (!existingTransaction) {
						await tx.insert(entityTrustapTransactions).values({
							entityId: itemId,
							sellerId: remote.seller_id,
							buyerId: remote.buyer_id,
							transactionId,
							transactionType: 'online_payment',
							status: remoteStatus,
							price: expectedPrice,
							charge: candidate.providerCharge,
							chargeSeller: remote.charge_seller,
							currency: 'eur',
							entityTitle: itemTitle,
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

					if (reservation.proposalId !== null) {
						const proposalId = reservation.proposalId;
						const [currentProposal] = await tx
							.select({ status: orders_proposals.status })
							.from(orders_proposals)
							.where(and(eq(orders_proposals.id, proposalId), eq(orders_proposals.item_id, itemId)))
							.for('update')
							.limit(1);
						if (!currentProposal) throw new Error('The proposal no longer exists');
						if (currentProposal.status === ORDER_PROPOSAL_PHASES.pending) {
							await tx
								.update(orders_proposals)
								.set({ status: recoveredProposalStatus, updated_at: new Date() })
								.where(eq(orders_proposals.id, proposalId));
							const [room] = await tx
								.select({ id: chat_rooms.id })
								.from(chat_rooms)
								.where(and(eq(chat_rooms.item_id, itemId), eq(chat_rooms.buyer_id, buyerProfileId)))
								.limit(1);
							if (!room) throw new Error('The proposal chat room no longer exists');
							await tx.insert(chat_messages).values({
								chat_room_id: room.id,
								sender_id: sellerProfileId,
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
										recipient_email: buyerEmail,
										merchant_username: sellerUsername,
										item_name: itemTitle,
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

					const [recoveredOrder] = await tx
						.update(orders)
						.set({
							payment_transaction_id: transactionId,
							legacy_payment_transaction_id: null,
							payment_creation_state:
								remoteStatus === 'complained'
									? PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED
									: PAYMENT_CREATION_STATES.CREATED,
							status: recoveredOrderStatus,
							...(['rejected', 'cancelled', 'cancelled_with_payment', 'payment_refunded'].includes(remoteStatus)
								? { payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED }
								: {}),
							updated_at: new Date(),
						})
						.where(
							and(
								eq(orders.id, reservation.id),
								eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED),
							),
						)
						.returning({ id: orders.id });
					if (!recoveredOrder) throw new Error('The order recovery state changed before finalization');
					return 'recovered' as const;
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
			const transition = resolveTrustapOrderTransition(current.status, current.orderStatus, remoteStatus);
			const resolvesCancellation =
				isAuthoritativeCancellationStatus(remoteStatus) &&
				current.orderCancellationState === PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED;
			const complaintRequiresReconciliation =
				transition.apply &&
				remoteStatus === entityTrustapTransactionTypeValues.COMPLAINED &&
				current.orderCreationState !== PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED;
			const resolvesCreationReconciliation =
				current.orderCreationState === PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED &&
				isAuthoritativeCreationResolutionStatus(remoteStatus);
			if (
				!transition.apply &&
				!resolvesCancellation &&
				!complaintRequiresReconciliation &&
				!resolvesCreationReconciliation
			) {
				return { outcome: 'ignored' };
			}
			if (await shippingLabelPurchaseDefersOrderTransition(tx, current.orderId)) {
				return { outcome: 'deferred' };
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
					status: transition.orderStatus,
					...(remoteStatus === entityTrustapTransactionTypeValues.COMPLAINED
						? { payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED }
						: resolvesCreationReconciliation
							? { payment_creation_state: PAYMENT_CREATION_STATES.CREATED }
							: {}),
					...(isAuthoritativeCancellationStatus(remoteStatus)
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
