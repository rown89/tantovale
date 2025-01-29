import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { getEnvVariable } from './utils';

import 'dotenv/config';

export const client = new Pool({
	connectionString: getEnvVariable('DATABASE_URL'),
});

export const db = drizzle({ client, schema });

async function main() {}

main();
