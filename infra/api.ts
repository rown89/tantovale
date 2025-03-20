import { rds } from './rds';
import { bucket } from './storage';
import { environment } from '../apps/server/src/utils/constants';
import { Input } from '../.sst/platform/src/components/input';

const allowedOrigins = ['http://localhost:3000', process.env.NEXT_PUBLIC_HONO_API_URL, 'https://tantovale.it']
	.filter(Boolean)
	// Remove trailing slashes
	.map((origin) => origin?.replace(/\/$/, ''));

export const api = new sst.aws.Function('Tantovale_HonoApi', {
	url: {
		cors: {
			allowOrigins: allowedOrigins,
			allowHeaders: [
				'Origin',
				'Content-Type',
				'X-Requested-With',
				'Accept',
				'Authorization',
				'x-amzn-RequestId',
				'X-Amzn-Trace-Id',
				'x-request-id',
			],
			allowCredentials: true,
			allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
			exposeHeaders: ['Content-Length', 'Set-Cookie', 'Origin'],
			maxAge: '600 seconds',
		},
	},
	link: [bucket, rds],
	handler: 'apps/server/src/app.handler',
	runtime: 'nodejs20.x',
	nodejs: { install: ['sharp'] },
	environment: environment as Input<Record<string, Input<string>>>,
});
