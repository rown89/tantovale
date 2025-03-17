import { vpc } from './vpc';
import { environment } from '../apps/server/src/utils/constants';

export const rds = new sst.aws.Postgres('Tantovale_Postgres', {
	dev: {
		username: environment.DATABASE_USERNAME,
		password: environment.DATABASE_PASSWORD,
		database: environment.DATABASE_NAME,
		host: environment.DATABASE_HOST,
		port: environment.DATABASE_PORT,
	},
	vpc,
});
