import type { DescribeRouteOptions } from 'hono-openapi';
import { losslessTrustapIdSchema, routeDescription, type ManualSchema } from '../common';

const request: ManualSchema = {
	type: 'object',
	properties: {
		event: { type: 'string', enum: ['transaction_updated'] },
		transaction_id: losslessTrustapIdSchema,
		status: {
			type: 'string',
			enum: [
				'created',
				'joined',
				'paid',
				'tracked',
				'delivered',
				'complained',
				'complaint_period_ended',
				'funds_released',
				'rejected',
				'cancelled',
				'cancelled_with_payment',
				'payment_refunded',
			],
		},
	},
	required: ['event', 'transaction_id', 'status'],
	additionalProperties: true,
};
export const webhooksOpenApi = {
	trustap: routeDescription({
		method: 'POST',
		path: '/webhooks/trustap/transaction-update',
		summary: 'Apply a Trustap transaction update',
		tag: 'Webhooks',
		security: 'webhook-basic',
		errors: [400, 401, 404, 409, 413, 500, 503],
		requestSchema: request,
		responseSchema: {
			type: 'object',
			properties: { success: { type: 'boolean', enum: [true] }, message: { type: 'string' } },
			required: ['success', 'message'],
			additionalProperties: false,
		},
	}),
} satisfies Record<string, DescribeRouteOptions>;
