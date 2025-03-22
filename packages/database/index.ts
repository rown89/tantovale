import 'dotenv/config';

import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schemas/schema';
import { parseEnv } from './env';

const { Pool } = pkg;

export type DrizzleClient = {
	db: NodePgDatabase<typeof schema>;
	client: typeof Pool;
};

export const dbConnection = {
	user: parseEnv(process.env).DATABASE_USERNAME,
	password: parseEnv(process.env).DATABASE_PASSWORD,
	host: parseEnv(process.env).DATABASE_HOST,
	port: Number(parseEnv(process.env).DATABASE_PORT),
	database: parseEnv(process.env).DATABASE_NAME,
};

const pool = new Pool(dbConnection);

export function createClient() {
	const client = pool;

	const db = drizzle(client, {
		schema,
	});

	return { db, client };
}
