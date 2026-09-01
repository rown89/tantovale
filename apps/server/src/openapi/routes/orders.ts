import type { DescribeRouteOptions } from 'hono-openapi';
import { losslessTrustapIdSchema, moneyCentsSchema, routeDescription, type ManualSchema } from '../common';

const orderSchema: ManualSchema = {
	type: 'object',
	properties: {
		id: { type: 'integer', minimum: 1 },
		status: { type: 'string' },
		item_price: moneyCentsSchema,
		original_price: moneyCentsSchema,
		shipping_price: moneyCentsSchema,
		platform_charge: moneyCentsSchema,
		payment_provider_charge: moneyCentsSchema,
		payment_transaction_id: losslessTrustapIdSchema,
		payment_url: { type: 'string', format: 'uri' },
		shipping_label_id: {
			type: 'string',
			description: 'A Shippo shipment object ID used to retrieve rates; it is not a purchased label transaction ID.',
		},
	},
	required: ['id', 'status'],
	additionalProperties: true,
};

export const ordersOpenApi = {
	byStatus: routeDescription({
		method: 'GET',
		path: '/orders/auth/status/:status',
		summary: 'List orders by status',
		tag: 'Orders',
		security: 'access-refresh-cookie',
		errors: [400, 401],
		responseSchema: { type: 'array', items: orderSchema },
	}),
	detail: routeDescription({
		method: 'GET',
		path: '/orders/auth/:id',
		summary: 'Get an order',
		tag: 'Orders',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404],
		responseSchema: orderSchema,
	}),
} satisfies Record<string, DescribeRouteOptions>;
