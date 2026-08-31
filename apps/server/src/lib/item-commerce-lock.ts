import { sql, type SQL } from 'drizzle-orm';

type SqlExecutor = {
	execute(query: SQL): PromiseLike<unknown>;
};

export const itemCommerceLockScope = ':item-commerce';

export function itemCommerceLockQuery(itemId: number): SQL {
	if (!Number.isSafeInteger(itemId) || itemId <= 0 || itemId > 2_147_483_647) {
		throw new Error('Cannot lock an invalid item id');
	}

	return sql`SELECT pg_advisory_xact_lock(hashtext(current_database() || ${itemCommerceLockScope}), ${itemId})`;
}

export async function acquireItemCommerceLock(executor: SqlExecutor, itemId: number): Promise<void> {
	await executor.execute(itemCommerceLockQuery(itemId));
}
