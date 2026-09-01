import type { DescribeRouteOptions } from 'hono-openapi';
import { moneyCentsSchema, positiveIntegerSchema, routeDescription, type ManualSchema } from '../common';

const itemSummarySchema: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		title: { type: 'string' },
		price: moneyCentsSchema,
		published: { type: 'boolean' },
		image: { type: 'string', format: 'uri', nullable: true },
		imageUrl: { type: 'string', format: 'uri', nullable: true },
	},
	required: ['id', 'title', 'price'],
	additionalProperties: true,
};

const itemCommonsSchema: ManualSchema = {
	type: 'object',
	properties: {
		address_id: positiveIntegerSchema,
		subcategory_id: positiveIntegerSchema,
		title: { type: 'string', minLength: 5, maxLength: 180, pattern: '^[a-zA-Z0-9\\s]+$' },
		description: { type: 'string', minLength: 50, maxLength: 2500 },
		price: { ...moneyCentsSchema, minimum: 1, maximum: 1_000_000 },
		easy_pay: { type: 'boolean' },
	},
	required: ['address_id', 'subcategory_id', 'title', 'description'],
	additionalProperties: false,
};

const shippingInputSchema: ManualSchema = {
	type: 'object',
	properties: Object.fromEntries(
		['item_weight', 'item_length', 'item_width', 'item_height', 'shipping_price'].map((name) => [
			name,
			{ type: 'integer', minimum: 0, maximum: 2_147_483_647 },
		]),
	),
	additionalProperties: false,
};

const propertyInputSchema: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		slug: { type: 'string' },
		value: {
			oneOf: [
				{ type: 'string' },
				{ type: 'integer', minimum: -2_147_483_648, maximum: 2_147_483_647 },
				{ type: 'boolean' },
				{ type: 'array', items: { type: 'string' } },
				{ type: 'array', items: { type: 'integer', minimum: -2_147_483_648, maximum: 2_147_483_647 } },
			],
		},
	},
	required: ['id', 'slug', 'value'],
	additionalProperties: false,
};

const createItemRequest: ManualSchema = {
	type: 'object',
	properties: {
		commons: itemCommonsSchema,
		shipping: shippingInputSchema,
		properties: { type: 'array', items: propertyInputSchema },
	},
	required: ['commons'],
	additionalProperties: false,
};

const updateItemRequest: ManualSchema = {
	...createItemRequest,
	properties: {
		commons: { ...itemCommonsSchema, required: [] },
		shipping: shippingInputSchema,
		properties: { type: 'array', items: propertyInputSchema },
	},
	required: [],
	description: 'At least one mutable item section must be supplied.',
};

const itemMutationResponse: ManualSchema = {
	type: 'object',
	properties: { message: { type: 'string' }, item_id: positiveIntegerSchema },
	required: ['message', 'item_id'],
	additionalProperties: false,
};

export const itemsOpenApi = {
	detail: routeDescription({
		method: 'GET',
		path: '/item/:id',
		summary: 'Get an item',
		tag: 'Items',
		security: 'optional-access-refresh-cookie',
		errors: [400, 404, 500],
		responseSchema: {
			type: 'object',
			properties: {
				id: positiveIntegerSchema,
				user: { type: 'object', additionalProperties: true },
				title: { type: 'string' },
				price: moneyCentsSchema,
				description: { type: 'string' },
				order: { type: 'object', additionalProperties: true },
				orderProposal: { type: 'object', additionalProperties: true },
				location: { type: 'object', additionalProperties: true },
				easy_pay: { type: 'boolean' },
				subcategory: { type: 'object', additionalProperties: true },
				properties: { type: 'array', items: { type: 'object', additionalProperties: true } },
				images: { type: 'array', items: { type: 'string', format: 'uri' } },
			},
			required: [
				'id',
				'user',
				'title',
				'price',
				'description',
				'order',
				'orderProposal',
				'location',
				'easy_pay',
				'subcategory',
				'properties',
				'images',
			],
			additionalProperties: false,
		},
	}),
	buyNow: routeDescription({
		method: 'POST',
		path: '/item/auth/buy_now',
		summary: 'Buy an item now',
		tag: 'Items',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 409, 500],
		requestSchema: {
			type: 'object',
			properties: { item_id: positiveIntegerSchema },
			required: ['item_id'],
			additionalProperties: false,
		},
		responseSchema: {
			type: 'object',
			properties: {
				success: { type: 'boolean', enum: [true] },
				order: {
					type: 'object',
					properties: { id: positiveIntegerSchema, status: { type: 'string' } },
					required: ['id', 'status'],
				},
				payment_url: { type: 'string', format: 'uri' },
				message: { type: 'string' },
			},
			required: ['success', 'order', 'payment_url', 'message'],
			additionalProperties: false,
		},
	}),
	create: routeDescription({
		method: 'POST',
		path: '/item/auth/new',
		summary: 'Create an item',
		tag: 'Items',
		security: 'access-refresh-cookie',
		success: 201,
		errors: [400, 401],
		requestSchema: createItemRequest,
		responseSchema: itemMutationResponse,
	}),
	publish: routeDescription({
		method: 'POST',
		path: '/item/auth/publish_state',
		summary: 'Change item publication state',
		tag: 'Items',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: {
			type: 'object',
			properties: { id: positiveIntegerSchema, published: { type: 'boolean' } },
			required: ['id', 'published'],
			additionalProperties: false,
		},
		responseSchema: {
			type: 'object',
			properties: { message: { type: 'string' }, id: positiveIntegerSchema },
			required: ['message', 'id'],
			additionalProperties: false,
		},
	}),
	remove: routeDescription({
		method: 'POST',
		path: '/item/auth/user_delete_item',
		summary: 'Delete an owned item',
		tag: 'Items',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: {
			type: 'object',
			properties: { id: { type: 'number' } },
			required: ['id'],
			additionalProperties: false,
		},
		responseSchema: {
			type: 'object',
			properties: { message: { type: 'string' }, id: { type: 'number' } },
			required: ['message', 'id'],
			additionalProperties: false,
		},
	}),
	edit: routeDescription({
		method: 'PUT',
		path: '/item/auth/edit/:id',
		summary: 'Edit an owned item',
		tag: 'Items',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: updateItemRequest,
		responseSchema: itemMutationResponse,
	}),
	byUsername: routeDescription({
		method: 'GET',
		path: '/items/:username',
		summary: 'List a user storefront',
		tag: 'Items',
		security: 'public',
		errors: [404, 500],
		responseSchema: { type: 'array', items: itemSummarySchema },
	}),
	favorites: routeDescription({
		method: 'GET',
		path: '/items/auth/user/favorites',
		summary: 'List authenticated user favorites',
		tag: 'Items',
		security: 'access-refresh-cookie',
		errors: [401, 500],
		responseSchema: { type: 'array', items: itemSummarySchema },
	}),
	selling: routeDescription({
		method: 'POST',
		path: '/items/auth/user/selling_items',
		summary: 'List authenticated user selling items',
		tag: 'Items',
		security: 'access-refresh-cookie',
		errors: [400, 401, 500],
		requestSchema: {
			type: 'object',
			properties: { published: { type: 'boolean' } },
			required: ['published'],
			additionalProperties: false,
		},
		responseSchema: { type: 'array', items: itemSummarySchema },
	}),
} satisfies Record<string, DescribeRouteOptions>;
