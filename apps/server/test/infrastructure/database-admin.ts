import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client, type ClientConfig } from 'pg';

import { assertDisposableDatabaseName, buildServerEnvironment, type TestRuntime } from './runtime';

const execFileAsync = promisify(execFile);
const serverDirectory = fileURLToPath(new URL('../../', import.meta.url));

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

	await execFileAsync('pnpm', ['exec', 'drizzle-kit', 'migrate', '--config', './src/database/drizzle.config.ts'], {
		cwd: serverDirectory,
		env: environment,
	});
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
