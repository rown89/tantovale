import { defineConfig } from 'drizzle-kit';

import 'dotenv/config';

export default defineConfig({
	dialect: 'postgresql',
	out: './drizzle/migrations',
	schema: './schema/schema.ts',

	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},

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
});
