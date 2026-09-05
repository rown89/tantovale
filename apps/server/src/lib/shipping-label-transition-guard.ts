import { and, eq, inArray } from 'drizzle-orm';

import type { DrizzleClient } from '#database/index';
import { shipping_label_purchases, SHIPPING_LABEL_PURCHASE_STATES } from '#db-schema';

type ItemTransaction = Parameters<Parameters<DrizzleClient['db']['transaction']>[0]>[0];

export const SHIPPING_LABEL_TRANSITION_DEFERRED = 'Shipping label purchase transition deferred';

const blockingStates = [
	SHIPPING_LABEL_PURCHASE_STATES.CREATING,
	SHIPPING_LABEL_PURCHASE_STATES.RECONCILIATION_REQUIRED,
];

/**
 * A label intent reserves the order's current phase until its remote outcome is
 * durable. Callers already hold the exact item commerce lock, so locking this
 * row after that advisory lock keeps one lock order across label, webhook and
 * polling writers. Deferred provider transitions must be retried unchanged.
 */
export async function shippingLabelPurchaseDefersOrderTransition(
	tx: ItemTransaction,
	orderId: number,
	providerTracking?: { carrier: string; tracking_code: string },
): Promise<boolean> {
	const [intent] = await tx
		.select({
			id: shipping_label_purchases.id,
			state: shipping_label_purchases.state,
			providerStatus: shipping_label_purchases.provider_status,
			providerTransactionId: shipping_label_purchases.provider_transaction_id,
			labelUrl: shipping_label_purchases.label_url,
			trackingNumber: shipping_label_purchases.tracking_number,
		})
		.from(shipping_label_purchases)
		.where(and(eq(shipping_label_purchases.order_id, orderId), inArray(shipping_label_purchases.state, blockingStates)))
		.for('update')
		.limit(1);

	if (!intent) return false;
	const reconciled =
		intent.state === SHIPPING_LABEL_PURCHASE_STATES.RECONCILIATION_REQUIRED &&
		intent.providerStatus === 'SUCCESS' &&
		intent.providerTransactionId !== null &&
		intent.labelUrl !== null &&
		intent.trackingNumber !== null &&
		providerTracking?.tracking_code === intent.trackingNumber;
	if (!reconciled) return true;

	const [updated] = await tx
		.update(shipping_label_purchases)
		.set({ state: SHIPPING_LABEL_PURCHASE_STATES.PURCHASED, updated_at: new Date() })
		.where(
			and(
				eq(shipping_label_purchases.id, intent.id),
				eq(shipping_label_purchases.state, SHIPPING_LABEL_PURCHASE_STATES.RECONCILIATION_REQUIRED),
			),
		)
		.returning({ id: shipping_label_purchases.id });
	return updated === undefined;
}
