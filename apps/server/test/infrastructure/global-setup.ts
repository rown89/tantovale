import { randomUUID } from 'node:crypto';
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import type { GlobalSetupContext } from 'vitest/node';

import { stopInfrastructure, startInfrastructure, type StartedInfrastructure } from './containers';
import { createDatabaseConnectionConfig, createMigratedDatabases } from './database-admin';
import { createWorkerBuckets } from './object-storage-admin';
import { API_TEST_WORKERS, createResourceNames, type TestRuntime } from './runtime';

function createRuntime(infrastructure: StartedInfrastructure): TestRuntime {
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
	};
}

async function assertProvisionedResources(runtime: TestRuntime): Promise<void> {
	const databaseNames = [runtime.resourceNames.templateDatabase, ...runtime.resourceNames.workerDatabases];
	const databaseClient = new Client(createDatabaseConnectionConfig(runtime, 'postgres'));
	const storageClient = new S3Client({
		endpoint: runtime.minio.endpoint,
		region: 'eu-west-1',
		forcePathStyle: true,
		credentials: {
			accessKeyId: runtime.minio.accessKey,
			secretAccessKey: runtime.minio.secretKey,
		},
	});

	try {
		await databaseClient.connect();
		const databases = await databaseClient.query<{ datname: string }>(
			'SELECT datname FROM pg_database WHERE datname = ANY($1::text[])',
			[databaseNames],
		);
		const buckets = await storageClient.send(new ListBucketsCommand({}));
		const foundDatabases = new Set(databases.rows.map((database) => database.datname));
		const foundBuckets = new Set(buckets.Buckets?.flatMap((bucket) => (bucket.Name ? [bucket.Name] : [])) ?? []);

		if (databaseNames.some((name) => !foundDatabases.has(name))) {
			throw new Error('Disposable test database provisioning did not create every expected database');
		}

		if (runtime.resourceNames.workerBuckets.some((name) => !foundBuckets.has(name))) {
			throw new Error('Disposable test object storage provisioning did not create every expected bucket');
		}
	} finally {
		storageClient.destroy();
		await databaseClient.end();
	}
}

export default async function globalSetup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
	let infrastructure: StartedInfrastructure | undefined;

	try {
		infrastructure = await startInfrastructure();
		const runtime = createRuntime(infrastructure);

		await createMigratedDatabases(runtime);
		await createWorkerBuckets(runtime);
		await assertProvisionedResources(runtime);
		provide('testRuntime', runtime);
		const startedInfrastructure = infrastructure;

		return async () => {
			await stopInfrastructure(startedInfrastructure);
		};
	} catch (setupError) {
		if (!infrastructure) {
			throw setupError;
		}

		try {
			await stopInfrastructure(infrastructure);
		} catch (cleanupError) {
			throw new AggregateError([setupError, cleanupError], 'API test infrastructure setup and cleanup both failed');
		}

		throw setupError;
	}
}
