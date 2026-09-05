import type { DescribeRouteOptions } from 'hono-openapi';
import { inboundTrustapIdSchema, routeDescription, type ManualSchema } from '../common';

const transactionStatuses = [
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
] as const;

const timestampProperties: Record<string, ManualSchema> = Object.fromEntries(
	[
		'created',
		'joined',
		'paid',
		'tracked',
		'delivered',
		'complained',
		'funds_released',
		'complaint_period_deadline',
		'complaint_period_ended',
		'rejected',
		'cancelled',
		'cancelled_with_payment',
		'payment_refunded',
	].map((property) => [property, { type: 'string', format: 'date-time' }]),
);

const request: ManualSchema = {
	type: 'object',
	properties: {
		code: {
			type: 'string',
			pattern: '^basic_tx\\.[a-z_]+$',
			description: 'Trustap v1 event code; its suffix must equal target_preview.status.',
		},
		user_id: { type: 'string', minLength: 1 },
		target_id: inboundTrustapIdSchema,
		target_preview: {
			type: 'object',
			properties: {
				id: inboundTrustapIdSchema,
				status: {
					type: 'string',
					pattern: '^[a-z][a-z0-9_]*$',
					description: `Known Trustap v1 statuses: ${transactionStatuses.join(', ')}. Unknown future statuses are acknowledged and quarantined.`,
				},
				tracking: {
					type: 'object',
					properties: {
						carrier: { type: 'string', minLength: 1 },
						tracking_code: { type: 'string', minLength: 1 },
					},
					required: ['carrier', 'tracking_code'],
					additionalProperties: true,
				},
				...timestampProperties,
			},
			required: ['id', 'status'],
			additionalProperties: true,
		},
		time: { type: 'string', format: 'date-time' },
		metadata: { type: 'object', additionalProperties: true },
	},
	required: ['code', 'target_id', 'target_preview'],
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
