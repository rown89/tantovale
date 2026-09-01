import type { DescribeRouteOptions } from 'hono-openapi';
import {
	losslessTrustapIdSchema,
	moneyCentsSchema,
	positiveIntegerSchema,
	proposalMessageInputSchema,
	queryParameter,
	routeDescription,
	type ManualSchema,
} from '../common';

const proposalStatuses = ['pending', 'accepted', 'rejected', 'expired', 'buyer_aborted'] as const;
const proposalSchema: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		item_id: positiveIntegerSchema,
		profile_id: positiveIntegerSchema,
		original_price: moneyCentsSchema,
		proposal_price: moneyCentsSchema,
		payment_provider_charge: moneyCentsSchema,
		platform_charge: moneyCentsSchema,
		shipping_label_id: { type: 'string' },
		shipping_quote_id: { type: 'string', format: 'uuid' },
		shipping_price: moneyCentsSchema,
		status: { type: 'string', enum: [...proposalStatuses] },
		created_at: { type: 'string', format: 'date-time' },
		updated_at: { type: 'string', format: 'date-time' },
	},
	required: ['id', 'status'],
	additionalProperties: true,
};

const createRequest: ManualSchema = {
	type: 'object',
	properties: {
		item_id: positiveIntegerSchema,
		proposal_price: { ...moneyCentsSchema, minimum: 1, maximum: 2_147_483_647 },
		shipping_label_id: {
			type: 'string',
			minLength: 1,
			description: 'Legacy Shippo shipment object ID; this is not a purchased label transaction ID.',
		},
		shipping_quote_id: { type: 'string', format: 'uuid' },
		message: proposalMessageInputSchema,
	},
	required: ['item_id', 'proposal_price', 'shipping_label_id', 'message'],
	additionalProperties: false,
};

export const proposalsOpenApi = {
	create: routeDescription({
		method: 'POST',
		path: '/orders_proposals/auth/create',
		summary: 'Create an order proposal',
		tag: 'Proposals',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: createRequest,
		responseSchema: {
			type: 'object',
			properties: { proposal: proposalSchema, chatRoomId: positiveIntegerSchema },
			required: ['proposal', 'chatRoomId'],
			additionalProperties: false,
		},
	}),
	update: routeDescription({
		method: 'PUT',
		path: '/orders_proposals/auth',
		summary: 'Accept or reject a proposal',
		tag: 'Proposals',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 409, 500],
		requestSchema: {
			type: 'object',
			properties: {
				id: positiveIntegerSchema,
				item_id: positiveIntegerSchema,
				status: { type: 'string', enum: ['accepted', 'rejected'] },
			},
			required: ['id', 'item_id', 'status'],
			additionalProperties: false,
		},
		responseSchema: {
			type: 'object',
			properties: {
				message: { type: 'string' },
				proposal: proposalSchema,
				order: { type: 'object', properties: { id: positiveIntegerSchema }, required: ['id'] },
				transaction: {
					type: 'object',
					properties: { id: losslessTrustapIdSchema, status: { type: 'string' } },
					required: ['id', 'status'],
				},
			},
			required: ['message', 'proposal'],
			additionalProperties: false,
		},
	}),
	abort: routeDescription({
		method: 'POST',
		path: '/orders_proposals/auth/buyer_aborted_proposal',
		summary: 'Abort a buyer proposal',
		tag: 'Proposals',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: {
			type: 'object',
			properties: { proposal_id: positiveIntegerSchema },
			required: ['proposal_id'],
			additionalProperties: false,
		},
		responseSchema: {
			type: 'object',
			properties: { message: { type: 'string' } },
			required: ['message'],
			additionalProperties: false,
		},
	}),
	detail: routeDescription({
		method: 'GET',
		path: '/orders_proposals/auth/:id',
		summary: 'Get a proposal',
		tag: 'Proposals',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		responseSchema: proposalSchema,
	}),
	byItem: routeDescription({
		method: 'GET',
		path: '/orders_proposals/auth/by_item/:item_id',
		summary: 'Get an item proposal',
		tag: 'Proposals',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		parameters: [
			{
				...queryParameter('status', 'Optional proposal status filter.', {
					type: 'string',
					enum: [...proposalStatuses],
				}),
				required: false,
			},
		],
		responseSchema: proposalSchema,
	}),
} satisfies Record<string, DescribeRouteOptions>;
