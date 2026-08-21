import type { Config } from 'drizzle-kit';
import { defineConfig } from 'drizzle-kit';
import { environment } from '../utils/constants';

const dbConnection = {
	host: environment.DATABASE_HOST,
	port: environment.DATABASE_PORT,
	user: environment.POSTGRES_USER,
	password: environment.POSTGRES_PASSWORD,
	database: environment.POSTGRES_DB,
};

export default defineConfig({
	dialect: 'postgresql',
	out: './src/database/drizzle/migrations',
	schema: './src/database/schemas/schema*.ts',
	dbCredentials: { ...dbConnection, ssl: false },
	extensionsFilters: ['postgis'],
	schemaFilter: 'public',
	tablesFilter: '*',

	introspect: {
		casing: 'camel',
	},

	migrations: {
		prefix: 'timestamp',
		table: '__drizzle_migrations__',
		schema: 'public',
	},

	entities: {
		roles: {
			provider: '',
			exclude: [],
			include: [],
		},
	},

	breakpoints: true,
	strict: true,
	verbose: true,
}) satisfies Config;
