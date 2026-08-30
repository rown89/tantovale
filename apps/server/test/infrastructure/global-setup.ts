import { randomUUID } from 'node:crypto';
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import type { GlobalSetupContext } from 'vitest/node';

import { stopInfrastructure, startInfrastructure, type StartedInfrastructure } from './containers';
import { createDatabaseConnectionConfig, createMigratedDatabases } from './database-admin';
import { createObjectStorageClient, createWorkerBuckets } from './object-storage-admin';
import { startProviderStub, type StartedProviderStub } from './provider-stubs';
import { API_TEST_WORKERS, createResourceNames, type TestRuntime } from './runtime';

function createRuntime(infrastructure: StartedInfrastructure, providerUrls: TestRuntime['providers']): TestRuntime {
	const runId = randomUUID().replaceAll('-', '').slice(0, 8);

	return {
		runId,
		workerCount: API_TEST_WORKERS,
		resourceNames: createResourceNames(runId, API_TEST_WORKERS),
		postgres: {
			host: infrastructure.postgres.getHost(),
			port: infrastructure.postgres.getMappedPort(5432),
			user: 'tantovale_test',
			password: 'tantovale_test',
		},
		minio: {
			endpoint: `http://${infrastructure.minio.getHost()}:${infrastructure.minio.getMappedPort(9000)}`,
			accessKey: 'tantovale_test',
			secretKey: 'tantovale_test_secret',
		},
		mailpit: {
			smtpHost: infrastructure.mailpit.getHost(),
			smtpPort: infrastructure.mailpit.getMappedPort(1025),
			apiUrl: `http://${infrastructure.mailpit.getHost()}:${infrastructure.mailpit.getMappedPort(8025)}`,
		},
		providers: providerUrls,
	};
}

async function startWorkerProviderStubs(): Promise<{
	started: StartedProviderStub[];
	urls: TestRuntime['providers'];
}> {
	const started: StartedProviderStub[] = [];
	const trustapUrls: string[] = [];
	const shippoUrls: string[] = [];

	try {
		for (let workerIndex = 0; workerIndex < API_TEST_WORKERS; workerIndex += 1) {
			const trustap = await startProviderStub('trustap');
			started.push(trustap);
			trustapUrls.push(trustap.url);

			const shippo = await startProviderStub('shippo');
			started.push(shippo);
			shippoUrls.push(shippo.url);
		}
	} catch (setupError) {
		const cleanupErrors = await closeProviderStubs(started);
		if (cleanupErrors.length > 0) {
			throw new AggregateError(
				[setupError, ...cleanupErrors],
				'Disposable provider stub setup and partial-start cleanup both failed',
			);
		}
		throw setupError;
	}

	return { started, urls: { trustapUrls, shippoUrls } };
}

async function closeProviderStubs(stubs: StartedProviderStub[]): Promise<unknown[]> {
	const results = await Promise.allSettled(stubs.map((stub) => stub.close()));
	return results
		.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		.map((result) => result.reason);
}

async function stopDisposableRuntime(
	providerStubs: StartedProviderStub[],
	infrastructure: StartedInfrastructure | undefined,
): Promise<unknown[]> {
	const errors = await closeProviderStubs(providerStubs);

	if (infrastructure) {
		try {
			await stopInfrastructure(infrastructure);
		} catch (error) {
			errors.push(error);
		}
	}

	return errors;
}

async function assertProvisionedResources(runtime: TestRuntime): Promise<void> {
	const databaseNames = [runtime.resourceNames.templateDatabase, ...runtime.resourceNames.workerDatabases];
	const databaseClient = new Client(createDatabaseConnectionConfig(runtime, 'postgres'));
	const storageClient = createObjectStorageClient(runtime);

	try {
		await databaseClient.connect();
		const databases = await databaseClient.query<{ datname: string }>(
			'SELECT datname FROM pg_database WHERE datname = ANY($1::text[])',
			[databaseNames],
		);
		const foundDatabases = new Set(databases.rows.map((database) => database.datname));

		if (databaseNames.some((name) => !foundDatabases.has(name))) {
			throw new Error('Disposable test database provisioning did not create every expected database');
		}

		await assertWorkerSchemas(runtime);

		const [buckets, mailpitResponse] = await Promise.all([
			storageClient.send(new ListBucketsCommand({}), { abortSignal: AbortSignal.timeout(10_000) }),
			fetch(`${runtime.mailpit.apiUrl}/api/v1/info`, { signal: AbortSignal.timeout(10_000) }),
		]);
		const foundBuckets = new Set(buckets.Buckets?.flatMap((bucket) => (bucket.Name ? [bucket.Name] : [])) ?? []);

		if (runtime.resourceNames.workerBuckets.some((name) => !foundBuckets.has(name))) {
			throw new Error('Disposable test object storage provisioning did not create every expected bucket');
		}

		if (!mailpitResponse.ok) {
			throw new Error(`Disposable test Mailpit readiness check failed with status ${mailpitResponse.status}`);
		}
	} finally {
		storageClient.destroy();
		await databaseClient.end();
	}
}

async function assertWorkerSchemas(runtime: TestRuntime): Promise<void> {
	for (const workerDatabase of runtime.resourceNames.workerDatabases) {
		const workerClient = new Client(createDatabaseConnectionConfig(runtime, workerDatabase));

		try {
			await workerClient.connect();
			const migrations = await workerClient.query<{ isMigrated: boolean }>(
				'SELECT COUNT(*) >= 1 AS "isMigrated" FROM public.__drizzle_migrations__',
			);
			const users = await workerClient.query<{ usersTableExists: boolean }>(
				'SELECT to_regclass(\'public.users\') IS NOT NULL AS "usersTableExists"',
			);

			if (!migrations.rows[0]?.isMigrated || !users.rows[0]?.usersTableExists) {
				throw new Error('The migration table or users table is missing');
			}
		} catch (error) {
			throw new Error(`Worker database ${workerDatabase} schema verification failed`, { cause: error });
		} finally {
			await workerClient.end();
		}
	}
}

export default async function globalSetup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
	let infrastructure: StartedInfrastructure | undefined;
	let providerStubs: StartedProviderStub[] = [];

	try {
		infrastructure = await startInfrastructure();
		const providers = await startWorkerProviderStubs();
		providerStubs = providers.started;
		const runtime = createRuntime(infrastructure, providers.urls);

		await createMigratedDatabases(runtime);
		await createWorkerBuckets(runtime);
		await assertProvisionedResources(runtime);
		provide('testRuntime', runtime);
		const startedInfrastructure = infrastructure;
		const startedProviderStubs = providerStubs;

		return async () => {
			const cleanupErrors = await stopDisposableRuntime(startedProviderStubs, startedInfrastructure);
			if (cleanupErrors.length > 0) {
				throw new AggregateError(cleanupErrors, 'Failed to stop disposable API test infrastructure');
			}
		};
	} catch (setupError) {
		const cleanupErrors = await stopDisposableRuntime(providerStubs, infrastructure);
		if (cleanupErrors.length > 0) {
			throw new AggregateError([setupError, ...cleanupErrors], 'API test infrastructure setup and cleanup both failed');
		}

		throw setupError;
	}
}
