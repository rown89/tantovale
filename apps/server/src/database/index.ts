import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schemas/schema';
import { environment } from '#utils/constants';

export type DrizzleClient = {
	db: NodePgDatabase<typeof schema>;
	client: typeof pg.Pool;
};

export const dbConnection = {
	host: environment.DATABASE_HOST,
	port: environment.DATABASE_PORT,
	user: environment.POSTGRES_USER,
	password: environment.POSTGRES_PASSWORD,
	database: environment.POSTGRES_DB,
};

const pool = new pg.Pool(dbConnection);

export function createClient() {
	const client = pool;

	const db = drizzle(client, {
		schema,
		// logger: new DefaultLogger({ writer: new ConsoleLogWriter() }),
	});

	return { db, client };
}
