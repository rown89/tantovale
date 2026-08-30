import { createClient } from '../../src/database';
import { assertDisposableDatabaseName } from '../infrastructure/runtime';

/* eslint-disable turbo/no-undeclared-env-vars -- This guard intentionally reads the worker's assigned test database. */
const DATABASE_TIMEOUT_MS = 10_000;

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

export function getTestDatabase() {
	assertDisposableDatabaseName(process.env.POSTGRES_DB ?? '');
	return createClient();
}

export async function resetDatabase(): Promise<void> {
	const { client } = getTestDatabase();
	const connection = await client.connect();

	try {
		await connection.query('BEGIN');
		await connection.query(`SET LOCAL statement_timeout = '${DATABASE_TIMEOUT_MS}'`);
		const { rows } = await connection.query<{ tablename: string }>(`
			SELECT tablename
			FROM pg_tables
			WHERE schemaname = 'public'
				AND tablename <> '__drizzle_migrations__'
			ORDER BY tablename
		`);
		const tableNames = rows.map(({ tablename }) => quoteIdentifier(tablename));

		if (tableNames.length > 0) {
			await connection.query(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`);
		}

		await connection.query('COMMIT');
	} catch (error) {
		try {
			await connection.query('ROLLBACK');
		} catch (rollbackError) {
			throw new AggregateError([error, rollbackError], 'Database reset and transaction rollback both failed');
		}

		throw error;
	} finally {
		connection.release();
	}
}
