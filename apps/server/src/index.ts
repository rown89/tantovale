import { serve } from '@hono/node-server';

import { app } from './app';
import { parseEnv } from './env';

const environment = parseEnv(process.env, { runtime: true });
const server_url = environment.SERVER_HOSTNAME;
const port = environment.SERVER_PORT;

console.log(`Server is running on port ${server_url}:${port}`);

serve({
	fetch: app.fetch,
	port,
});
