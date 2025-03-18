import { rds } from './rds';

export const studio = new sst.x.DevCommand('Studio', {
	link: [rds],
	dev: {
		command: 'npx drizzle-kit studio --config=./packages/database/drizzle.config.ts',
	},
});
