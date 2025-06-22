import { Scalar } from '@scalar/hono-api-reference';
import { openAPISpecs } from 'hono-openapi';

import type { AppAPI } from './types';

export function configureOpenAPI(app: AppAPI) {
	// Create an endpoint that builds the OpenAPI spec dynamically
	app.get('/openapi', async (c) => {
		const { hostname, protocol, port } = new URL(c.req.url);

		// Get the server URL from the environment
		const serverUrl = `${protocol}//${hostname}${port ? `:${port}` : ''}`;

		// Create the spec handler with the dynamic URL
		const handler = openAPISpecs(app, {
			documentation: {
				info: {
					title: 'Tantovale Honojs',
					version: '1.0.0',
					description: 'Tantovale API',
				},
				servers: [
					{
						url: serverUrl,
					},
				],
			},
			defaultOptions: {
				GET: {
					responses: {
						400: {
							description: 'Zod Error',
						},
					},
				},
			},
		});
		// Call the dynamically created handler with the current context
		return handler(c, async () => {});
	});

	// Serve the API reference using the /openapi spec
	app.get(
		'/',
		Scalar({
			theme: 'saturn',
			url: '/openapi',
		}),
	);
}
