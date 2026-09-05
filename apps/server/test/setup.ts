import { afterAll, beforeEach, inject } from 'vitest';

import { buildServerEnvironment, getWorkerIndex } from './infrastructure/runtime';

/* eslint-disable turbo/no-undeclared-env-vars -- Vitest provides this identifier for each isolated worker process. */
const runtime = inject('testRuntime');
const workerIndex = getWorkerIndex(process.env.VITEST_POOL_ID, runtime.workerCount);
const database = runtime.resourceNames.workerDatabases[workerIndex];
const bucket = runtime.resourceNames.workerBuckets[workerIndex];

if (!database || !bucket) {
	throw new Error(`No disposable database and bucket were assigned to Vitest worker ${workerIndex}`);
}

const trustapUrl = runtime.providers.trustapUrls[workerIndex];
const shippoUrl = runtime.providers.shippoUrls[workerIndex];

if (!trustapUrl || !shippoUrl) {
	throw new Error(`No commerce provider stub pair was assigned to Vitest worker ${workerIndex}`);
}

Object.assign(process.env, buildServerEnvironment(runtime, database, bucket, workerIndex), {
	MAILPIT_API_URL: runtime.mailpit.apiUrl,
	PGSSLMODE: 'disable',
});

const { closeTestDatabase, resetDatabase } = await import('./helpers/database');
const { resetObjectStorage } = await import('./helpers/object-storage');
const { resetProviderStubs } = await import('./helpers/providers');

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	const results = await Promise.allSettled([
		resetDatabase(),
		resetObjectStorage(bucket, runtime.minio.endpoint),
		resetProviderStubs({ trustapUrl, shippoUrl }),
	]);
	const errors = results
		.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		.map((result) => result.reason);

	if (errors.length > 0) {
		throw new AggregateError(errors, 'Failed to reset worker database, object storage, and providers before test');
	}
});
