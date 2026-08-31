import { eq, and, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { subHours } from 'date-fns';

import { createClient } from '#database/index';
import {
	chat_messages,
	chat_rooms,
	entityTrustapTransactions,
	items,
	orders,
	orders_proposals,
	profiles,
} from '#db-schema';
import { PaymentProviderService } from './payment-provider.service';
import {
	entityTrustapTransactionStatusValues,
	type EntityTrustapTransactionStatus,
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CREATION_STATES,
} from '#database/schemas/enumerated_values';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';

type TransactionSyncResult = {
	transactionId: number | null;
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

export class TransactionSyncService {
	private paymentProviderService: PaymentProviderService;
	private db = createClient();

	constructor() {
		this.paymentProviderService = new PaymentProviderService();
	}

	private async recoverKnownTransactions(): Promise<TransactionSyncResult[]> {
		const { db } = this.db;
		const buyerProfiles = alias(profiles, 'transaction_sync_buyer_profiles');
		const sellerProfiles = alias(profiles, 'transaction_sync_seller_profiles');
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
				orderStatus: orders.status,
				itemTitle: items.title,
				buyerProfileId: orders.buyer_id,
				sellerProfileId: orders.seller_id,
				buyerProviderId: buyerProfiles.payment_provider_id,
				sellerProviderId: sellerProfiles.payment_provider_id,
			})
			.from(orders)
			.innerJoin(items, eq(orders.item_id, items.id))
			.innerJoin(buyerProfiles, eq(orders.buyer_id, buyerProfiles.id))
			.innerJoin(sellerProfiles, eq(orders.seller_id, sellerProfiles.id))
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
				candidate.buyerProfileId === null ||
				candidate.sellerProfileId === null ||
				!candidate.buyerProviderId ||
				!candidate.sellerProviderId
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

				await db.transaction(async (tx) => {
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
						.select({ entityId: entityTrustapTransactions.entityId })
						.from(entityTrustapTransactions)
						.where(eq(entityTrustapTransactions.transactionId, transactionId))
						.limit(1);
					if (existingTransaction && existingTransaction.entityId !== itemId) {
						throw new Error('The Trustap transaction id belongs to another local item');
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
							entityTitle: candidate.itemTitle,
							claimedBySeller: false,
							claimedByBuyer: false,
							complaintPeriodDeadline: null,
						});
					}

					if (reservation.proposalId !== null) {
						const proposalId = reservation.proposalId;
						const [acceptedProposal] = await tx
							.update(orders_proposals)
							.set({ status: ORDER_PROPOSAL_PHASES.accepted, updated_at: new Date() })
							.where(
								and(
									eq(orders_proposals.id, proposalId),
									eq(orders_proposals.item_id, itemId),
									eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
								),
							)
							.returning({ id: orders_proposals.id });
						if (!acceptedProposal) throw new Error('The proposal is no longer pending');
						const [room] = await tx
							.select({ id: chat_rooms.id })
							.from(chat_rooms)
							.where(and(eq(chat_rooms.item_id, itemId), eq(chat_rooms.buyer_id, buyerProfileId)))
							.limit(1);
						if (!room) throw new Error('The proposal chat room no longer exists');
						await tx.insert(chat_messages).values({
							chat_room_id: room.id,
							sender_id: sellerProfileId,
							message: `Proposal #${proposalId}, has been accepted by the seller.`,
							message_type: 'system',
							metadata: { order_id: reservation.id, type: 'proposal_accepted' },
						});
					}

					const [recoveredOrder] = await tx
						.update(orders)
						.set({
							payment_transaction_id: transactionId,
							legacy_payment_transaction_id: null,
							payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
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
				});
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

	/**
	 * Sync transaction statuses with Trustap
	 * This method can be called periodically to ensure our database is in sync
	 */
	async syncTransactionStatuses() {
		const { db } = this.db;

		try {
			const recoveryResults = await this.recoverKnownTransactions();
			const staleTransactions = await db
				.select({
					id: entityTrustapTransactions.id,
					entityId: entityTrustapTransactions.entityId,
					transactionId: entityTrustapTransactions.transactionId,
					status: entityTrustapTransactions.status,
					updated_at: entityTrustapTransactions.updated_at,
				})
				.from(entityTrustapTransactions)
				.where(lt(entityTrustapTransactions.updated_at, subHours(new Date(), 1)));
			const syncResults: TransactionSyncResult[] = [...recoveryResults];

			for (const transaction of staleTransactions) {
				try {
					// Provider I/O must never hold a database transaction or the item commerce lock.
					const trustapStatus = await this.paymentProviderService.getTransactionStatus(transaction.transactionId);
					if (!trustapStatus) {
						console.warn(`Could not get status for transaction ${transaction.transactionId}`);
						continue;
					}
					if (trustapStatus.status !== transaction.status) {
						await db.transaction(async (tx) => {
							if (transaction.entityId !== null) await acquireItemCommerceLock(tx, transaction.entityId);
							await tx
								.update(entityTrustapTransactions)
								.set({
									status: trustapStatus.status as EntityTrustapTransactionStatus,
									updated_at: new Date(),
								})
								.where(eq(entityTrustapTransactions.transactionId, transaction.transactionId));
							await tx
								.update(orders)
								.set({ status: trustapStatus.status, updated_at: new Date() })
								.where(eq(orders.payment_transaction_id, transaction.transactionId));
						});
						syncResults.push({
							transactionId: transaction.transactionId,
							oldStatus: transaction.status,
							newStatus: trustapStatus.status,
							success: true,
						});
						console.log(
							`Synced transaction ${transaction.transactionId}: ${transaction.status} → ${trustapStatus.status}`,
						);
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

			return {
				totalTransactions: staleTransactions.length + recoveryResults.length,
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
	async getTransactionDetails(transactionId: number) {
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
