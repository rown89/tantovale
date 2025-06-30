import { eq, and, lt } from 'drizzle-orm';
import { subHours } from 'date-fns';

import { createClient } from '#database/index';
import { entityTrustapTransactions, orders } from '#db-schema';
import { PaymentProviderService } from './payment-provider.service';

export class TransactionSyncService {
	private paymentProviderService: PaymentProviderService;
	private db = createClient();

	constructor() {
		this.paymentProviderService = new PaymentProviderService();
	}

	/**
	 * Sync transaction statuses with Trustap
	 * This method can be called periodically to ensure our database is in sync
	 */
	async syncTransactionStatuses() {
		const { db } = this.db;

		try {
			return await db.transaction(async (tx) => {
				// Get transactions that haven't been updated in the last hour
				const staleTransactions = await tx
					.select({
						id: entityTrustapTransactions.id,
						transactionId: entityTrustapTransactions.transactionId,
						status: entityTrustapTransactions.status,
						updated_at: entityTrustapTransactions.updated_at,
					})
					.from(entityTrustapTransactions)
					.where(
						and(
							lt(entityTrustapTransactions.updated_at, subHours(new Date(), 1)),
							// Only sync transactions that are not in final states
							// Adjust these statuses based on Trustap's final states
							// eq(entityTrustapTransactions.status, 'pending'),
						),
					);

				const syncResults = [];

				for (const transaction of staleTransactions) {
					try {
						// Get current status from Trustap
						const trustapStatus = await this.paymentProviderService.getTransactionStatus(transaction.transactionId);

						if (!trustapStatus) {
							console.warn(`Could not get status for transaction ${transaction.transactionId}`);
							continue;
						}

						// Update our database if status has changed
						if (trustapStatus.status !== transaction.status) {
							const [updatedTransaction] = await tx
								.update(entityTrustapTransactions)
								.set({
									status: trustapStatus.status,
									updated_at: new Date(),
								})
								.where(eq(entityTrustapTransactions.transactionId, transaction.transactionId))
								.returning();

							// Update corresponding order status
							await tx
								.update(orders)
								.set({
									status: trustapStatus.status,
									updated_at: new Date(),
								})
								.where(eq(orders.payment_transaction_id, transaction.transactionId));

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
					totalTransactions: staleTransactions.length,
					syncedTransactions: syncResults.filter((r) => r.success).length,
					failedTransactions: syncResults.filter((r) => !r.success).length,
					results: syncResults,
				};
			});
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
