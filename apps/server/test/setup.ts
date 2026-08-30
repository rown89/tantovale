import { beforeEach, inject } from 'vitest';

import { buildServerEnvironment, getWorkerIndex } from './infrastructure/runtime';

/* eslint-disable turbo/no-undeclared-env-vars -- Vitest provides this identifier for each isolated worker process. */
const runtime = inject('testRuntime');
const workerIndex = getWorkerIndex(process.env.VITEST_POOL_ID, runtime.workerCount);
const database = runtime.resourceNames.workerDatabases[workerIndex];
const bucket = runtime.resourceNames.workerBuckets[workerIndex];

if (!database || !bucket) {
	throw new Error(`No disposable database and bucket were assigned to Vitest worker ${workerIndex}`);
}

Object.assign(process.env, buildServerEnvironment(runtime, database, bucket), {
	MAILPIT_API_URL: runtime.mailpit.apiUrl,
	PGSSLMODE: 'disable',
});

const { resetDatabase } = await import('./helpers/database');
const { resetObjectStorage } = await import('./helpers/object-storage');

beforeEach(async () => {
	const results = await Promise.allSettled([resetDatabase(), resetObjectStorage()]);
	const errors = results
		.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		.map((result) => result.reason);

	if (errors.length > 0) {
		throw new AggregateError(errors, 'Failed to reset worker database and object storage before test');
	}
});
