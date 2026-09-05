import { sql, type SQL } from 'drizzle-orm';

type SqlExecutor = {
	execute(query: SQL): PromiseLike<unknown>;
};

export async function acquireAddressTransactionLock(executor: SqlExecutor, profileId: number): Promise<void> {
	if (!Number.isSafeInteger(profileId)) {
		throw new Error('Cannot lock an invalid profile id');
	}

	await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(current_database() || ':addresses'), ${profileId})`);
}
