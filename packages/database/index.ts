import 'dotenv/config';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnvVariable } from './utils';
import * as schema from './schema/schema';

// Initialize PostgreSQL
const client = new Pool({
	connectionString: getEnvVariable('DATABASE_URL'),
});

// Initialize Drizzle ORM with the database client and schema
export const db = drizzle(client, { schema });
export { schema, client };

async function main() {
	try {
		await client.connect();
		console.log('Database connected successfully');
	} catch (error) {
		console.error('Database connection error:', error);
	}
}

main();
