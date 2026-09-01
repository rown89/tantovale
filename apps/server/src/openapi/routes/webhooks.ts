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
		created: { type: 'string', format: 'date-time' },
		joined: { type: 'string', format: 'date-time' },
		paid: { type: 'string', format: 'date-time' },
		tracked: { type: 'string', format: 'date-time' },
		delivered: { type: 'string', format: 'date-time' },
		complained: { type: 'string', format: 'date-time' },
		funds_released: { type: 'string', format: 'date-time' },
		complaint_period_deadline: { type: 'string', format: 'date-time' },
		complaint_period_ended: { type: 'string', format: 'date-time' },
		rejected: { type: 'string', format: 'date-time' },
		cancelled: { type: 'string', format: 'date-time' },
		cancelled_with_payment: { type: 'string', format: 'date-time' },
		payment_refunded: { type: 'string', format: 'date-time' },
		code: { not: {} },
		target_id: { not: {} },
		target_preview: { not: {} },
	},
	required: ['event', 'transaction_id', 'status'],
	additionalProperties: false,
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
