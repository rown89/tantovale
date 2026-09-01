import type { DescribeRouteOptions } from 'hono-openapi';
import { routeDescription } from '../common';

export const uploadsOpenApi = {
	itemImages: routeDescription({
		method: 'POST',
		path: '/uploads/auth/images-item',
		summary: 'Upload item image variants',
		tag: 'Uploads',
		security: 'access-refresh-cookie',
		success: 201,
		errors: [400, 401, 404, 413, 500],
		requestMediaType: 'multipart/form-data',
		requestSchema: {
			type: 'object',
			properties: {
				item_id: { type: 'string', pattern: '^[1-9][0-9]*$', description: 'Positive int4 item ID form field.' },
				images: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', format: 'binary' } },
			},
			required: ['item_id', 'images'],
		},
		responseSchema: {
			type: 'object',
			properties: {
				message: { type: 'string' },
				item_id: { type: 'string', pattern: '^[1-9][0-9]*$' },
				files: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							originalKey: { type: 'string' },
							smallKey: { type: 'string' },
							mediumKey: { type: 'string' },
							thumbKey: { type: 'string' },
							orderPosition: { type: 'integer', minimum: 0 },
						},
						required: ['originalKey', 'smallKey', 'mediumKey', 'thumbKey', 'orderPosition'],
						additionalProperties: false,
					},
				},
			},
			required: ['message', 'item_id', 'files'],
			additionalProperties: false,
		},
	}),
} satisfies Record<string, DescribeRouteOptions>;
