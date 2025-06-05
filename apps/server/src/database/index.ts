import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schemas/schema';
import { parseEnv } from '../env';

export type DrizzleClient = {
	db: NodePgDatabase<typeof schema>;
	client: typeof pg.Pool;
};

export const dbConnection = {
	host: parseEnv(process.env).DATABASE_HOST,
	port: parseEnv(process.env).DATABASE_PORT,
	user: parseEnv(process.env).POSTGRES_USER,
	password: parseEnv(process.env).POSTGRES_PASSWORD,
	database: parseEnv(process.env).POSTGRES_DB,
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
