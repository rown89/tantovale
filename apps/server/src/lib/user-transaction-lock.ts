import { sql, type SQL } from 'drizzle-orm';

type SqlExecutor = {
	execute(query: SQL): PromiseLike<unknown>;
};

export async function acquireUserTransactionLock(executor: SqlExecutor, userId: number): Promise<void> {
	if (!Number.isSafeInteger(userId)) {
		throw new Error('Cannot lock an invalid user id');
	}

	await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(current_database()), ${userId})`);
}
