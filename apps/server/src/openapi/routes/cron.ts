import type { DescribeRouteOptions } from 'hono-openapi';
import { jsonEntityListSchema, routeDescription, type ManualSchema } from '../common';

const ordersResponse: ManualSchema = {
	type: 'object',
	properties: {
		orders: jsonEntityListSchema,
		reconciliation_required: jsonEntityListSchema,
		cancellation_superseded: jsonEntityListSchema,
		status: { type: 'integer', enum: [200] },
		message: { type: 'string' },
	},
	required: ['message', 'status'],
	additionalProperties: false,
};
const proposalsResponse: ManualSchema = {
	type: 'object',
	properties: {
		proposals: jsonEntityListSchema,
		status: { type: 'integer', enum: [200] },
		message: { type: 'string' },
	},
	required: ['message', 'status'],
	additionalProperties: false,
};
const syncResponse: ManualSchema = {
	type: 'object',
	properties: {
		totalTransactions: { type: 'integer', minimum: 0 },
		syncedTransactions: { type: 'integer', minimum: 0 },
		failedTransactions: { type: 'integer', minimum: 0 },
		results: jsonEntityListSchema,
	},
	required: ['totalTransactions', 'syncedTransactions', 'failedTransactions', 'results'],
	additionalProperties: false,
};
export const cronOpenApi = {
	expiredOrders: routeDescription({
		method: 'GET',
		path: '/cron/auth/expired-orders-check',
		summary: 'Expire stale payment-pending orders',
		tag: 'Cron',
		security: 'cron-secret',
		errors: [401, 500],
		responseSchema: ordersResponse,
	}),
	expiredProposals: routeDescription({
		method: 'GET',
		path: '/cron/auth/expired-proposals-check',
		summary: 'Expire stale proposals',
		tag: 'Cron',
		security: 'cron-secret',
		errors: [401, 500],
		responseSchema: proposalsResponse,
	}),
	syncTransactions: routeDescription({
		method: 'GET',
		path: '/cron/auth/sync-transactions',
		summary: 'Synchronize provider transactions',
		tag: 'Cron',
		security: 'cron-secret',
		errors: [401, 500],
		responseSchema: syncResponse,
	}),
} satisfies Record<string, DescribeRouteOptions>;
