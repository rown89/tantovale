/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(input) {
		return {
			name: 'tantovale-sst',
			home: 'aws',
			removal: input?.stage === 'production' ? 'retain' : 'remove',
			providers: {
				aws: {
					profile: input.stage === 'production' ? 'tantovale-production' : 'tantovale-dev',
				},
			},
		};
	},
	async run() {
		const frontend = await import('./infra/next');
		const hono = await import('./infra/api');
		//	const storage = await import('./infra/storage');
		const postgres = await import('./infra/rds');
		const drizzleStudio = await import('./infra/drizzle-studio');

		return {
			nextJs: frontend.nextjs.url,
			api: hono.api.url,
			//	bucket: storage.bucket.name,
			rds: postgres.rds.database,
			d_studio: drizzleStudio.studio.urn,
		};
	},
});
