import { hc } from 'hono/client';

import type { ApiRoutesType } from '../app';

const serverUrl = process.env.NEXT_PUBLIC_HONO_API_URL;

export const client = hc<ApiRoutesType>(`${serverUrl}/`, {
	init: {
		credentials: 'include',
	},
});
