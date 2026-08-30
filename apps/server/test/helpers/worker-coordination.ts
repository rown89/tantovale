import { Client } from 'pg';
import { expect, inject } from 'vitest';

import { environment } from '../../src/utils/constants';
import { getTestDatabase } from './database';
import { getWorkerIndex } from '../infrastructure/runtime';

/* eslint-disable turbo/no-undeclared-env-vars -- Vitest provides this identifier for each isolated worker process. */
const DATABASE_TIMEOUT_MS = 10_000;
const BARRIER_TIMEOUT_MS = 10_000;
const BARRIER_POLL_INTERVAL_MS = 100;
const BARRIER_LOCK_ID = 56_520_601;
const coordinationTable = 'vitest_worker_observations';

function createAdminClient(runtime: ReturnType<typeof inject<'testRuntime'>>): Client {
	return new Client({
		host: runtime.postgres.host,
		port: runtime.postgres.port,
		user: runtime.postgres.user,
		password: runtime.postgres.password,
		database: 'postgres',
		ssl: false,
		connectionTimeoutMillis: DATABASE_TIMEOUT_MS,
		query_timeout: DATABASE_TIMEOUT_MS,
		statement_timeout: DATABASE_TIMEOUT_MS,
	});
}

async function waitForDistinctWorkerObservations(client: Client, runId: string): Promise<void> {
	const deadline = Date.now() + BARRIER_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const { rows } = await client.query<{
			poolIds: string;
			databases: string;
			buckets: string;
		}>(
			`
			SELECT
				COUNT(DISTINCT pool_id)::text AS "poolIds",
				COUNT(DISTINCT database_name)::text AS databases,
				COUNT(DISTINCT bucket_name)::text AS buckets
			FROM ${coordinationTable}
			WHERE run_id = $1
		`,
			[runId],
		);
		const observed = rows[0];

		if (observed?.poolIds === '2' && observed.databases === '2' && observed.buckets === '2') {
			return;
		}

		await new Promise<void>((resolve) => setTimeout(resolve, BARRIER_POLL_INTERVAL_MS));
	}

	throw new Error('Timed out waiting for two distinct Vitest workers to report their disposable resources');
}

export async function proveWorkerResourceIsolation(): Promise<void> {
	const runtime = inject('testRuntime');
	const poolId = process.env.VITEST_POOL_ID ?? '';
	const workerIndex = getWorkerIndex(poolId, runtime.workerCount);
	const expectedDatabase = runtime.resourceNames.workerDatabases[workerIndex];
	const expectedBucket = runtime.resourceNames.workerBuckets[workerIndex];

	if (!expectedDatabase || !expectedBucket) {
		throw new Error(`No worker resources were assigned to Vitest worker ${poolId || '<missing>'}`);
	}

	expect(environment.POSTGRES_DB).toBe(expectedDatabase);
	expect(environment.AWS_BUCKET_NAME).toBe(expectedBucket);

	const { client: workerClient } = getTestDatabase();
	const currentDatabase = await workerClient.query<{ database: string }>('SELECT current_database() AS database');
	expect(currentDatabase.rows[0]?.database).toBe(expectedDatabase);

	const adminClient = createAdminClient(runtime);

	try {
		await adminClient.connect();
		await adminClient.query('SELECT pg_advisory_lock($1)', [BARRIER_LOCK_ID]);
		try {
			await adminClient.query(`
				CREATE TABLE IF NOT EXISTS ${coordinationTable} (
					run_id text NOT NULL,
					pool_id text NOT NULL,
					database_name text NOT NULL,
					bucket_name text NOT NULL,
					PRIMARY KEY (run_id, pool_id)
				)
			`);
		} finally {
			await adminClient.query('SELECT pg_advisory_unlock($1)', [BARRIER_LOCK_ID]);
		}

		await adminClient.query(
			`
				INSERT INTO ${coordinationTable} (run_id, pool_id, database_name, bucket_name)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (run_id, pool_id) DO UPDATE
				SET database_name = EXCLUDED.database_name, bucket_name = EXCLUDED.bucket_name
			`,
			[runtime.runId, poolId, expectedDatabase, expectedBucket],
		);
		await waitForDistinctWorkerObservations(adminClient, runtime.runId);
	} finally {
		await adminClient.end();
	}
}
