import type { Config } from 'drizzle-kit';
import { defineConfig } from 'drizzle-kit';
import { dbConnection } from '.';

export default defineConfig({
	dialect: 'postgresql',
	out: './drizzle/migrations',
	schema: './schemas/schema*.ts',
	dbCredentials: { ...dbConnection },
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
