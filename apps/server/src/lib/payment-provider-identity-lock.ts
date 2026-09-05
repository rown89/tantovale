import { sql, type SQL } from 'drizzle-orm';

type SqlExecutor = {
	execute(query: SQL): PromiseLike<unknown>;
};

export const paymentProviderIdentityLockScope = ':payment-provider-identity';

export function paymentProviderIdentityLockQuery(profileId: number): SQL {
	if (!Number.isSafeInteger(profileId) || profileId <= 0) {
		throw new Error('Cannot lock an invalid profile id');
	}

	return sql`SELECT pg_advisory_xact_lock(hashtext(current_database() || ${paymentProviderIdentityLockScope}), ${profileId})`;
}

export async function acquirePaymentProviderIdentityLock(executor: SqlExecutor, profileId: number): Promise<void> {
	await executor.execute(paymentProviderIdentityLockQuery(profileId));
}
