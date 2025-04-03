import { hc } from 'hono/client';
import type { ApiRoutesType } from '@workspace/server/apiRoutes';

const serverUrl = process.env.NEXT_PUBLIC_HONO_API_URL;

export const client = hc<ApiRoutesType>(`${serverUrl}/`, {
	init: {
		credentials: 'include',
	},
});
