import type { DescribeRouteOptions } from 'hono-openapi';
import { moneyCentsSchema, positiveIntegerSchema, routeDescription, type ManualSchema } from '../common';

const request: ManualSchema = {
	type: 'object',
	properties: {
		price: positiveIntegerSchema,
		shipping_price: { ...moneyCentsSchema, maximum: 2_147_483_647 },
	},
	required: ['price', 'shipping_price'],
	additionalProperties: false,
};
const response: ManualSchema = {
	type: 'object',
	properties: {
		platform_charge: moneyCentsSchema,
		payment_provider_charge: moneyCentsSchema,
		proposalExpireTime: { type: 'number', minimum: 0 },
	},
	required: ['platform_charge', 'payment_provider_charge', 'proposalExpireTime'],
	additionalProperties: false,
};
export const platformCostsOpenApi = {
	calculate: routeDescription({
		method: 'POST',
		path: '/platforms_costs/auth/calculate_platform_costs',
		summary: 'Calculate platform costs',
		tag: 'Platform costs',
		security: 'access-refresh-cookie',
		errors: [400, 401, 500],
		requestSchema: request,
		responseSchema: response,
	}),
} satisfies Record<string, DescribeRouteOptions>;
