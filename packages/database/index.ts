import 'dotenv/config';

import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schemas/schema.js';
import { parseEnv } from './env';

const { Pool } = pkg;

export type DrizzleClient = {
	db: NodePgDatabase<typeof schema>;
	client: typeof Pool;
};

export const dbConnection = {
	host: parseEnv(process.env).DATABASE_HOST,
	port: Number(parseEnv(process.env).DATABASE_PORT),
	user: parseEnv(process.env).POSTGRES_USER,
	password: parseEnv(process.env).POSTGRES_PASSWORD,
	database: parseEnv(process.env).POSTGRES_DB,
};

const pool = new Pool(dbConnection);

export function createClient() {
	const client = pool;

	const db = drizzle(client, {
		schema,
	});

	return { db, client };
}
