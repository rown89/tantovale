import { inArray, or, sql, type SQL } from 'drizzle-orm';

import { newOrderBlockedStates, PAYMENT_CREATION_STATES } from '#database/schemas/enumerated_values';
import { orders } from '#database/schemas/orders';

type SqlExecutor = {
	execute(query: SQL): PromiseLike<unknown>;
};

export const itemCommerceLockScope = ':item-commerce';

const paymentCreationBlockedStates = [
	PAYMENT_CREATION_STATES.PREPARING,
	PAYMENT_CREATION_STATES.CREATING,
	PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
];

export function itemCommerceOrderBlockingPredicate(): SQL {
	const predicate = or(
		inArray(orders.status, newOrderBlockedStates),
		inArray(orders.payment_creation_state, paymentCreationBlockedStates),
	);
	if (!predicate) throw new Error('Item commerce order blocking predicate is empty');
	return predicate;
}

export function itemCommerceLockQuery(itemId: number): SQL {
	if (!Number.isSafeInteger(itemId) || itemId <= 0 || itemId > 2_147_483_647) {
		throw new Error('Cannot lock an invalid item id');
	}

	return sql`SELECT pg_advisory_xact_lock(hashtext(current_database() || ${itemCommerceLockScope}), ${itemId})`;
}

export async function acquireItemCommerceLock(executor: SqlExecutor, itemId: number): Promise<void> {
	await executor.execute(itemCommerceLockQuery(itemId));
}
