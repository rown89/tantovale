import type { DescribeRouteOptions } from 'hono-openapi';
import { routeDescription } from '../common';

export const documentationOpenApi = {
	root: routeDescription({
		method: 'GET',
		path: '/',
		summary: 'Open the API reference',
		tag: 'Documentation',
		security: 'public',
		responseMediaType: 'text/html',
		responseSchema: { type: 'string' },
	}),
	openapi: routeDescription({
		method: 'GET',
		path: '/openapi',
		summary: 'Get the OpenAPI document',
		tag: 'Documentation',
		security: 'public',
		responseSchema: {
			type: 'object',
			properties: {
				openapi: { type: 'string' },
				info: { type: 'object', additionalProperties: true },
				paths: { type: 'object', additionalProperties: true },
			},
			required: ['openapi', 'info', 'paths'],
			additionalProperties: true,
		},
	}),
} satisfies Record<string, DescribeRouteOptions>;
