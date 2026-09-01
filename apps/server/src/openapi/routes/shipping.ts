import type { DescribeRouteOptions } from 'hono-openapi';
import { positiveIntegerSchema, routeDescription, type ManualSchema } from '../common';

const shippingQuote: ManualSchema = {
	type: 'object',
	properties: {
		shipment_label_id: {
			type: 'string',
			description: 'A Shippo shipment object ID used to retrieve rates; it is not a purchased label transaction ID.',
		},
		amount: { type: 'string', pattern: '^\\d+(?:\\.\\d{1,2})?$' },
		currency: { type: 'string', enum: ['EUR'] },
		shipping_quote_id: { type: 'string', format: 'uuid' },
	},
	required: ['amount', 'currency', 'shipment_label_id', 'shipping_quote_id'],
	additionalProperties: true,
};
const shipmentResponse: ManualSchema = {
	type: 'object',
	properties: { rates: { type: 'array', minItems: 1, maxItems: 1, items: shippingQuote } },
	required: ['rates'],
	additionalProperties: false,
};
const carriersResponse: ManualSchema = {
	type: 'object',
	properties: {
		activeCarriers: {
			type: 'array',
			items: {
				type: 'object',
				properties: { accountId: { type: 'string' }, active: { type: 'boolean' }, carrier: { type: 'string' } },
				required: ['accountId', 'active', 'carrier'],
				additionalProperties: false,
			},
		},
	},
	required: ['activeCarriers'],
	additionalProperties: false,
};
const labelRequest: ManualSchema = {
	type: 'object',
	properties: { order_id: positiveIntegerSchema, rate_id: { type: 'string', minLength: 1 } },
	required: ['order_id', 'rate_id'],
	additionalProperties: false,
};
const labelResponse: ManualSchema = {
	type: 'object',
	properties: {
		label: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				status: { type: 'string', enum: ['SUCCESS'] },
				label_url: { type: 'string', format: 'uri' },
				tracking_number: { type: 'string', nullable: true },
				tracking_url: { type: 'string', nullable: true, format: 'uri' },
			},
			required: ['id', 'status', 'label_url'],
		},
	},
	required: ['label'],
};
export const shippingOpenApi = {
	carriers: routeDescription({
		method: 'GET',
		path: '/shipment_provider/auth/active_carriers',
		summary: 'List active shipping carriers',
		tag: 'Shipping',
		security: 'access-refresh-cookie',
		errors: [401, 404, 502],
		responseSchema: carriersResponse,
	}),
	quote: routeDescription({
		method: 'POST',
		path: '/shipment_provider/auth/calculate_shipment_cost',
		summary: 'Calculate shipment cost',
		tag: 'Shipping',
		security: 'access-refresh-cookie',
		errors: [400, 401, 500, 502],
		requestSchema: {
			type: 'object',
			properties: { item_id: positiveIntegerSchema },
			required: ['item_id'],
			additionalProperties: false,
		},
		responseSchema: shipmentResponse,
	}),
	label: routeDescription({
		method: 'POST',
		path: '/shipment_provider/auth/create_label',
		summary: 'Purchase a verified shipping label',
		tag: 'Shipping',
		security: 'access-refresh-cookie',
		success: 201,
		errors: [400, 401, 404, 409, 502],
		requestSchema: labelRequest,
		responseSchema: labelResponse,
	}),
} satisfies Record<string, DescribeRouteOptions>;
