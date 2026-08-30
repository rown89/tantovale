import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client, type ClientConfig } from 'pg';

import { assertDisposableDatabaseName, buildServerEnvironment, type TestRuntime } from './runtime';

const execFileAsync = promisify(execFile);
const serverDirectory = fileURLToPath(new URL('../../', import.meta.url));
const repositoryDirectory = fileURLToPath(new URL('../../../../', import.meta.url));
const DATABASE_TIMEOUT_MS = 10_000;
const MIGRATION_TIMEOUT_MS = 180_000;

export function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

export function createDatabaseConnectionConfig(runtime: TestRuntime, database: string): ClientConfig {
	return {
		host: runtime.postgres.host,
		port: runtime.postgres.port,
		user: runtime.postgres.user,
		password: runtime.postgres.password,
		database,
		ssl: false,
		connectionTimeoutMillis: DATABASE_TIMEOUT_MS,
		query_timeout: DATABASE_TIMEOUT_MS,
		statement_timeout: DATABASE_TIMEOUT_MS,
	};
}

async function withAdminClient<T>(runtime: TestRuntime, operation: (client: Client) => Promise<T>): Promise<T> {
	const client = new Client(createDatabaseConnectionConfig(runtime, 'postgres'));

	try {
		await client.connect();
		return await operation(client);
	} finally {
		await client.end();
	}
}

async function migrateTemplateDatabase(runtime: TestRuntime): Promise<void> {
	const migrationBucket = runtime.resourceNames.workerBuckets[0];
	if (!migrationBucket) {
		throw new Error('A worker bucket is required to migrate the template database');
	}

	const environment = {
		...process.env,
		...buildServerEnvironment(runtime, runtime.resourceNames.templateDatabase, migrationBucket),
	};

	try {
		await execFileAsync(
			'pnpm',
			['--dir', serverDirectory, 'exec', 'drizzle-kit', 'migrate', '--config', './src/database/drizzle.config.ts'],
			{
				cwd: repositoryDirectory,
				env: environment,
				timeout: MIGRATION_TIMEOUT_MS,
				killSignal: 'SIGTERM',
				maxBuffer: 10 * 1024 * 1024,
			},
		);
	} catch (error) {
		throw new Error('Drizzle migration for the disposable template database failed or timed out', { cause: error });
	}
}

export async function createMigratedDatabases(runtime: TestRuntime): Promise<void> {
	const { templateDatabase, workerDatabases } = runtime.resourceNames;

	assertDisposableDatabaseName(templateDatabase);
	for (const workerDatabase of workerDatabases) {
		assertDisposableDatabaseName(workerDatabase);
	}

	await withAdminClient(runtime, async (client) => {
		await client.query(`CREATE DATABASE ${quoteIdentifier(templateDatabase)}`);
	});

	await migrateTemplateDatabase(runtime);

	await withAdminClient(runtime, async (client) => {
		for (const workerDatabase of workerDatabases) {
			await client.query(
				`CREATE DATABASE ${quoteIdentifier(workerDatabase)} TEMPLATE ${quoteIdentifier(templateDatabase)}`,
			);
		}
	});
}
