import { eq, and, inArray, isNull, lt, notExists } from 'drizzle-orm';
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
	shipping_quotes,
	users,
} from '#db-schema';
import { buildGuestPaymentUrl, PaymentProviderService } from './payment-provider.service';
import { sendProposalAcceptedMessage } from '#mailer/templates/proposals/buyer/proposal-accepted';
import {
	entityTrustapTransactionStatusValues,
	type EntityTrustapTransactionStatus,
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CREATION_STATES,
} from '#database/schemas/enumerated_values';
import { acquireItemCommerceLock } from '#lib/item-commerce-lock';
import { resolveTrustapOrderTransition } from './trustap-order-state';
import type { TrustapId } from './trustap-int64';

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

function proposalStatusForRecoveredTransaction(status: EntityTrustapTransactionStatus) {
	return ['rejected', 'cancelled', 'cancelled_with_payment', 'payment_refunded'].includes(status)
		? ORDER_PROPOSAL_PHASES.rejected
		: ORDER_PROPOSAL_PHASES.accepted;
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
				buyerProviderId: buyerProfiles.payment_provider_id,
				sellerProviderId: sellerProfiles.payment_provider_id,
				buyerEmail: buyerUsers.email,
				sellerUsername: sellerUsers.username,
				notificationClaimedAt: orders.payment_recovery_notification_claimed_at,
			})
			.from(orders)
			.innerJoin(items, eq(orders.item_id, items.id))
			.innerJoin(buyerProfiles, eq(orders.buyer_id, buyerProfiles.id))
			.innerJoin(sellerProfiles, eq(orders.seller_id, sellerProfiles.id))
			.innerJoin(buyerUsers, eq(buyerProfiles.user_id, buyerUsers.id))
			.innerJoin(sellerUsers, eq(sellerProfiles.user_id, sellerUsers.id))
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
					remote.postage_fee !== candidate.shippingPrice ||
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
				const recoveredTransition = resolveTrustapOrderTransition(
					entityTrustapTransactionStatusValues[0],
					candidate.orderStatus,
					remoteStatus,
				);
				const recoveredProposalStatus = proposalStatusForRecoveredTransaction(remoteStatus);
				const shouldSendPaymentInvitation =
					recoveredProposalStatus === ORDER_PROPOSAL_PHASES.accepted &&
					recoveredTransition.orderStatus === ORDER_PHASES.PAYMENT_PENDING;

				const recovery = await db.transaction(async (tx) => {
					await acquireItemCommerceLock(tx, itemId);
					const [reservation] = await tx
						.select({
							id: orders.id,
							paymentTransactionId: orders.payment_transaction_id,
							legacyTransactionId: orders.legacy_payment_transaction_id,
							proposalId: orders.order_proposal_id,
							notificationClaimedAt: orders.payment_recovery_notification_claimed_at,
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
							entityId: entityTrustapTransactions.entityId,
							status: entityTrustapTransactions.status,
						})
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
						const [finalizedProposal] = await tx
							.update(orders_proposals)
							.set({ status: recoveredProposalStatus, updated_at: new Date() })
							.where(
								and(
									eq(orders_proposals.id, proposalId),
									eq(orders_proposals.item_id, itemId),
									eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.pending),
								),
							)
							.returning({ id: orders_proposals.id });
						if (!finalizedProposal) throw new Error('The proposal is no longer pending');
						const [room] = await tx
							.select({ id: chat_rooms.id })
							.from(chat_rooms)
							.where(and(eq(chat_rooms.item_id, itemId), eq(chat_rooms.buyer_id, buyerProfileId)))
							.limit(1);
						if (!room) throw new Error('The proposal chat room no longer exists');
						await tx.insert(chat_messages).values({
							chat_room_id: room.id,
							sender_id: sellerProfileId,
							message:
								recoveredProposalStatus === ORDER_PROPOSAL_PHASES.accepted
									? `Proposal #${proposalId}, has been accepted by the seller.`
									: `Proposal #${proposalId}, was not completed by the payment provider.`,
							message_type: 'system',
							metadata: {
								order_id: reservation.id,
								type:
									recoveredProposalStatus === ORDER_PROPOSAL_PHASES.accepted
										? 'proposal_accepted'
										: 'proposal_rejected',
							},
						});
					}

					const [recoveredOrder] = await tx
						.update(orders)
						.set({
							payment_transaction_id: transactionId,
							legacy_payment_transaction_id: null,
							payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
							status: recoveredTransition.orderStatus,
							...(reservation.proposalId !== null &&
							shouldSendPaymentInvitation &&
							reservation.notificationClaimedAt === null
								? { payment_recovery_notification_claimed_at: new Date() }
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
					return {
						shouldNotify:
							reservation.proposalId !== null &&
							shouldSendPaymentInvitation &&
							reservation.notificationClaimedAt === null,
					};
				});
				if (recovery.shouldNotify) {
					try {
						await sendProposalAcceptedMessage({
							to: candidate.buyerEmail,
							merchant_username: candidate.sellerUsername,
							itemName: candidate.itemTitle,
							orderId: candidate.orderId,
							paymentUrl: buildGuestPaymentUrl(transactionId, candidate.orderId),
						});
					} catch (error) {
						console.error('Failed to send recovered proposal notification:', error);
						await db
							.update(orders)
							.set({ payment_recovery_notification_claimed_at: null, updated_at: new Date() })
							.where(eq(orders.id, candidate.orderId));
					}
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

	/** Retry mail delivery only for a successfully recovered, still-payable proposal. */
	private async dispatchPendingRecoveryNotifications(): Promise<void> {
		const { db } = this.db;
		const buyerProfiles = alias(profiles, 'recovery_mail_buyer_profiles');
		const sellerProfiles = alias(profiles, 'recovery_mail_seller_profiles');
		const buyerUsers = alias(users, 'recovery_mail_buyer_users');
		const sellerUsers = alias(users, 'recovery_mail_seller_users');
		const pending = await db
			.select({
				orderId: orders.id,
				transactionId: orders.payment_transaction_id,
				buyerEmail: buyerUsers.email,
				sellerUsername: sellerUsers.username,
				itemTitle: items.title,
			})
			.from(orders)
			.innerJoin(orders_proposals, eq(orders.order_proposal_id, orders_proposals.id))
			.innerJoin(items, eq(orders.item_id, items.id))
			.innerJoin(buyerProfiles, eq(orders.buyer_id, buyerProfiles.id))
			.innerJoin(sellerProfiles, eq(orders.seller_id, sellerProfiles.id))
			.innerJoin(buyerUsers, eq(buyerProfiles.user_id, buyerUsers.id))
			.innerJoin(sellerUsers, eq(sellerProfiles.user_id, sellerUsers.id))
			.where(
				and(
					eq(orders.payment_creation_state, PAYMENT_CREATION_STATES.CREATED),
					eq(orders.status, ORDER_PHASES.PAYMENT_PENDING),
					eq(orders_proposals.status, ORDER_PROPOSAL_PHASES.accepted),
					isNull(orders.payment_recovery_notification_claimed_at),
				),
			);

		for (const candidate of pending) {
			if (candidate.transactionId === null) continue;
			const [claimed] = await db
				.update(orders)
				.set({ payment_recovery_notification_claimed_at: new Date(), updated_at: new Date() })
				.where(and(eq(orders.id, candidate.orderId), isNull(orders.payment_recovery_notification_claimed_at)))
				.returning({ id: orders.id });
			if (!claimed) continue;
			try {
				await sendProposalAcceptedMessage({
					to: candidate.buyerEmail,
					merchant_username: candidate.sellerUsername,
					itemName: candidate.itemTitle,
					orderId: candidate.orderId,
					paymentUrl: buildGuestPaymentUrl(candidate.transactionId, candidate.orderId),
				});
			} catch (error) {
				console.error('Failed to send recovered proposal notification:', error);
				await db
					.update(orders)
					.set({ payment_recovery_notification_claimed_at: null, updated_at: new Date() })
					.where(eq(orders.id, candidate.orderId));
			}
		}
	}

	/**
	 * Sync transaction statuses with Trustap
	 * This method can be called periodically to ensure our database is in sync
	 */
	async syncTransactionStatuses() {
		const { db } = this.db;

		try {
			const recoveryResults = await this.recoverKnownTransactions();
			await this.dispatchPendingRecoveryNotifications();
			const staleReservationResults = await this.recoverStalePaymentReservations();
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
					orderItemPrice: orders.item_price,
					orderPlatformCharge: orders.platform_charge,
					orderProviderCharge: orders.payment_provider_charge,
					orderShippingPrice: orders.shipping_price,
					orderAttemptId: orders.payment_attempt_id,
				})
				.from(entityTrustapTransactions)
				.leftJoin(orders, eq(orders.payment_transaction_id, entityTrustapTransactions.transactionId))
				.where(lt(entityTrustapTransactions.updated_at, subHours(new Date(), 1)));
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
					if (
						trustapStatus.id !== transaction.transactionId ||
						transaction.entityId === null ||
						transaction.orderId === null ||
						transaction.orderItemId !== transaction.entityId ||
						transaction.orderStatus === null ||
						transaction.orderItemPrice === null ||
						transaction.orderPlatformCharge === null ||
						transaction.orderProviderCharge === null ||
						transaction.orderShippingPrice === null ||
						transaction.providerBuyerId === null ||
						transaction.providerSellerId === null ||
						transaction.providerCurrency !== 'eur' ||
						transaction.providerPrice !== transaction.orderItemPrice + transaction.orderPlatformCharge ||
						transaction.providerCharge !== transaction.orderProviderCharge ||
						transaction.providerChargeSeller !== 0 ||
						trustapStatus.buyer_id !== transaction.providerBuyerId ||
						trustapStatus.seller_id !== transaction.providerSellerId ||
						trustapStatus.currency !== transaction.providerCurrency ||
						trustapStatus.price !== transaction.providerPrice ||
						trustapStatus.postage_fee !== transaction.orderShippingPrice ||
						trustapStatus.charge !== transaction.providerCharge ||
						trustapStatus.charge_seller !== transaction.providerChargeSeller ||
						(transaction.orderAttemptId !== null && !trustapStatus.description.includes(transaction.orderAttemptId))
					) {
						throw new Error('Trustap transaction is not correlated to one local order and item');
					}
					const itemId = transaction.entityId;
					const orderId = transaction.orderId;
					const orderStatus = transaction.orderStatus;
					const transition = resolveTrustapOrderTransition(transaction.status, orderStatus, trustapStatus.status);
					if (transition.apply) {
						await db.transaction(async (tx) => {
							await acquireItemCommerceLock(tx, itemId);
							await tx
								.update(entityTrustapTransactions)
								.set({
									status: transition.providerStatus,
									updated_at: new Date(),
								})
								.where(
									and(
										eq(entityTrustapTransactions.transactionId, transaction.transactionId),
										eq(entityTrustapTransactions.status, transaction.status),
									),
								);
							await tx
								.update(orders)
								.set({ status: transition.orderStatus, updated_at: new Date() })
								.where(and(eq(orders.id, orderId), eq(orders.status, orderStatus)));
						});
						syncResults.push({
							transactionId: transaction.transactionId,
							oldStatus: transaction.status,
							newStatus: transition.providerStatus,
							success: true,
						});
						console.log(
							`Synced transaction ${transaction.transactionId}: ${transaction.status} → ${transition.providerStatus}`,
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
