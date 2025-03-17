import { rds } from './rds';
import { bucket } from './storage';
import { environment } from '../apps/server/src/utils/constants';
import { Input } from '../.sst/platform/src/components/input';

export const api = new sst.aws.Function('Tantovale_HonoApi', {
	url: {
		cors: {
			allowCredentials: true,
			allowOrigins: ['http://localhost:3000', 'https://tantovale.it'],
			maxAge: '1 day',
		},
	},

	link: [bucket, rds],
	handler: 'apps/server/src/app.handler',
	runtime: 'nodejs20.x',
	nodejs: { install: ['sharp'] },
	environment: environment as Input<Record<string, Input<string>>>,
});
