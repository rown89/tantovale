import type { DescribeRouteOptions } from 'hono-openapi';
import { positiveIntegerSchema, routeDescription, type ManualSchema } from '../common';

const participantSchema: ManualSchema = {
	type: 'object',
	properties: { id: positiveIntegerSchema, username: { type: 'string' } },
	required: ['id', 'username'],
	additionalProperties: false,
};

const messageSchema: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		chat_room_id: positiveIntegerSchema,
		sender_id: positiveIntegerSchema,
		sender: participantSchema,
		message: { type: 'string', minLength: 1, maxLength: 600 },
		message_type: { type: 'string', enum: ['text', 'proposal', 'system', 'buy_now'] },
		order_proposal_id: { ...positiveIntegerSchema, nullable: true },
		created_at: { type: 'string', format: 'date-time' },
		read_at: { type: 'string', format: 'date-time', nullable: true },
		metadata: { type: 'object', additionalProperties: true, nullable: true },
	},
	required: ['id', 'message'],
	additionalProperties: true,
};

const roomIdSchema: ManualSchema = {
	type: 'object',
	properties: { id: positiveIntegerSchema },
	additionalProperties: false,
};

export const chatOpenApi = {
	rooms: routeDescription({
		method: 'GET',
		path: '/chat/auth/rooms',
		summary: 'List chat rooms',
		tag: 'Chat',
		security: 'access-refresh-cookie',
		errors: [401, 500],
		responseSchema: {
			type: 'array',
			maxItems: 100,
			items: {
				type: 'object',
				properties: {
					id: positiveIntegerSchema,
					item: { type: 'object', additionalProperties: true },
					author: participantSchema,
					buyer: participantSchema,
					last_message: { type: 'object', additionalProperties: true },
				},
				required: ['id', 'item', 'author', 'buyer', 'last_message'],
				additionalProperties: false,
			},
		},
	}),
	roomByItem: routeDescription({
		method: 'GET',
		path: '/chat/auth/rooms/id/:item_id',
		summary: 'Get the chat room for an item',
		tag: 'Chat',
		security: 'access-refresh-cookie',
		errors: [400, 401, 500],
		responseSchema: roomIdSchema,
	}),
	messages: routeDescription({
		method: 'GET',
		path: '/chat/auth/rooms/:roomId/messages',
		summary: 'List room messages',
		tag: 'Chat',
		security: 'access-refresh-cookie',
		errors: [400, 401, 403, 404, 500],
		responseSchema: { type: 'array', items: messageSchema },
	}),
	createRoom: routeDescription({
		method: 'POST',
		path: '/chat/auth/rooms',
		summary: 'Create a chat room',
		tag: 'Chat',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: {
			type: 'object',
			properties: { item_id: positiveIntegerSchema },
			required: ['item_id'],
			additionalProperties: false,
		},
		responseSchema: { ...roomIdSchema, required: ['id'] },
	}),
	sendMessage: routeDescription({
		method: 'POST',
		path: '/chat/auth/rooms/:roomId/messages',
		summary: 'Send a chat message',
		tag: 'Chat',
		security: 'access-refresh-cookie',
		errors: [400, 401, 403, 404, 500],
		requestSchema: {
			type: 'object',
			properties: { message: { type: 'string', minLength: 1, maxLength: 600 } },
			required: ['message'],
			additionalProperties: false,
		},
		responseSchema: messageSchema,
	}),
} satisfies Record<string, DescribeRouteOptions>;
