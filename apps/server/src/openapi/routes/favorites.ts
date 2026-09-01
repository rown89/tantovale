import type { DescribeRouteOptions } from 'hono-openapi';
import { booleanSchema, positiveIntegerSchema, routeDescription } from '../common';

export const favoritesOpenApi = {
	check: routeDescription({
		method: 'GET',
		path: '/favorites/auth/check/:item_id',
		summary: 'Check whether an item is favorited',
		tag: 'Favorites',
		security: 'access-refresh-cookie',
		errors: [400, 401, 500],
		responseSchema: booleanSchema,
	}),
	handle: routeDescription({
		method: 'POST',
		path: '/favorites/auth/handle',
		summary: 'Add or remove a favorite',
		tag: 'Favorites',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: {
			type: 'object',
			properties: { action: { type: 'string', enum: ['add', 'remove'] }, item_id: positiveIntegerSchema },
			required: ['action', 'item_id'],
			additionalProperties: false,
		},
		responseSchema: booleanSchema,
	}),
} satisfies Record<string, DescribeRouteOptions>;
