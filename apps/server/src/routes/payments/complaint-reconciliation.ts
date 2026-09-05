import { and, eq } from 'drizzle-orm';

import type { DrizzleClient } from '#database/index';
import { commerce_reconciliation_audit } from '#db-schema';
import {
	entityTrustapTransactionTypeValues,
	type EntityTrustapTransactionStatus,
} from '#database/schemas/enumerated_values';
import type { TrustapId } from './trustap-int64';
import { isAuthoritativeCreationResolutionStatus } from './trustap-order-state';

type ItemTransaction = Parameters<Parameters<DrizzleClient['db']['transaction']>[0]>[0];

export const COMPLAINT_RECONCILIATION_MARKER = 'runtime_complaint_reconciliation_pending';

type ComplaintReconciliationContext = {
	orderId: number;
	providerId: number | null;
	transactionId: TrustapId;
	currentProviderStatus: EntityTrustapTransactionStatus | undefined;
	incomingProviderStatus: EntityTrustapTransactionStatus;
};

/**
 * The audit row is a durable marker, not evidence of a mismatch. Every commerce
 * writer calls this while holding the item's advisory lock, making the
 * read-before-insert idempotent without a second uniqueness mechanism.
 */
export async function complaintRequiresDurableReconciliation(
	tx: ItemTransaction,
	context: ComplaintReconciliationContext,
): Promise<{ required: boolean; inserted: boolean }> {
	const [existingMarker] = await tx
		.select({ id: commerce_reconciliation_audit.id })
		.from(commerce_reconciliation_audit)
		.where(
			and(
				eq(commerce_reconciliation_audit.conflict_type, COMPLAINT_RECONCILIATION_MARKER),
				eq(commerce_reconciliation_audit.source_table, 'orders'),
				eq(commerce_reconciliation_audit.source_row_id, context.orderId),
			),
		)
		.limit(1);

	const complaintNeedsDurableMarker =
		context.incomingProviderStatus === entityTrustapTransactionTypeValues.COMPLAINED ||
		(context.currentProviderStatus === entityTrustapTransactionTypeValues.COMPLAINED &&
			!isAuthoritativeCreationResolutionStatus(context.incomingProviderStatus));
	const shouldInsert = complaintNeedsDurableMarker && existingMarker === undefined;
	if (shouldInsert) {
		await tx.insert(commerce_reconciliation_audit).values({
			conflict_type: COMPLAINT_RECONCILIATION_MARKER,
			source_table: 'orders',
			source_row_id: context.orderId,
			canonical_row_id: context.providerId,
			original_reference: context.transactionId,
			snapshot: {
				reason: 'complaint_requires_authoritative_resolution',
				providerStatusBefore: context.currentProviderStatus ?? null,
				remoteStatus: context.incomingProviderStatus,
			},
		});
	}

	return {
		inserted: shouldInsert,
		required:
			context.incomingProviderStatus === entityTrustapTransactionTypeValues.COMPLAINED ||
			((existingMarker !== undefined ||
				context.currentProviderStatus === entityTrustapTransactionTypeValues.COMPLAINED) &&
				!isAuthoritativeCreationResolutionStatus(context.incomingProviderStatus)),
	};
}
