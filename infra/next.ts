import { api } from './api';
import { bucket } from './storage';

export const nextjs = new sst.aws.Nextjs('Tantovale_Frontend', {
	path: 'apps/storefront',
	link: [bucket, api],
	environment: {
		NEXT_PUBLIC_HONO_API_URL: api.url,
	},
});
