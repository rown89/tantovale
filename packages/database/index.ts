import 'dotenv/config';

import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schemas/schema';

const { Pool } = pkg;

export type DrizzleClient = {
	db: NodePgDatabase<typeof schema>;
	client: typeof Pool;
};

export const dbConnection = {
	user: process.env.DATABASE_USERNAME,
	password: process.env.DATABASE_PASSWORD,
	host: process.env.DATABASE_HOST,
	port: Number(process.env.DATABASE_PORT),
	database: process.env.DATABASE_NAME,
};

const pool = new Pool(dbConnection);

export function createClient() {
	const client = pool;

	const db = drizzle(client, {
		schema,
	});

	return { db, client };
}
