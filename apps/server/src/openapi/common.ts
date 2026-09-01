import type { DescribeRouteOptions } from 'hono-openapi';

type Responses = NonNullable<DescribeRouteOptions['responses']>;
type Response = Exclude<Responses[string], { $ref: string }>;
type Content = NonNullable<Response['content']>;
export type ManualSchema = NonNullable<Content[string]['schema']>;
export type ManualParameter = NonNullable<DescribeRouteOptions['parameters']>[number];

export type ApiSecurity =
	| 'public'
	| 'optional-access-refresh-cookie'
	| 'access-refresh-cookie'
	| 'refresh-cookie'
	| 'cron-secret'
	| 'webhook-basic';

export const jsonObjectSchema = {
	type: 'object',
	additionalProperties: true,
} as const satisfies ManualSchema;

export const jsonEntityListSchema = {
	type: 'array',
	items: jsonObjectSchema,
} as const satisfies ManualSchema;

export const booleanSchema = { type: 'boolean' } as const satisfies ManualSchema;

export const nullablePositiveIntegerSchema = {
	type: 'integer',
	minimum: 1,
	maximum: 2_147_483_647,
	nullable: true,
} as const satisfies ManualSchema;

export const messageSchema = {
	type: 'object',
	properties: { message: { type: 'string' } },
	required: ['message'],
	additionalProperties: false,
} as const satisfies ManualSchema;

export const errorSchema = {
	type: 'object',
	properties: {
		message: { type: 'string' },
		error: { type: 'string' },
	},
	additionalProperties: true,
} as const satisfies ManualSchema;

export const positiveIntegerSchema = {
	type: 'integer',
	minimum: 1,
	maximum: 2_147_483_647,
} as const satisfies ManualSchema;

export const moneyCentsSchema = {
	type: 'integer',
	minimum: 0,
	description: 'Amount in integer euro cents.',
} as const satisfies ManualSchema;

export const losslessTrustapIdSchema = {
	oneOf: [{ type: 'string', pattern: '^[0-9]+$' }, { type: 'integer' }],
	description: 'Lossless Trustap integer identifier; large values are represented as decimal strings.',
} as const satisfies ManualSchema;

export const securityRequirements: Record<ApiSecurity, Array<Record<string, never[]>>> = {
	public: [],
	'optional-access-refresh-cookie': [{}, { accessCookie: [], refreshCookie: [] }],
	'access-refresh-cookie': [{ accessCookie: [], refreshCookie: [] }],
	'refresh-cookie': [{ refreshCookie: [] }],
	'cron-secret': [{ cronKey: [] }],
	'webhook-basic': [{ trustapWebhookBasic: [] }],
};

const errorDescriptions: Record<number, string> = {
	400: 'Invalid request',
	401: 'Authentication required or invalid credentials',
	403: 'Authenticated caller is not allowed to perform this operation',
	404: 'Requested resource was not found',
	409: 'Request conflicts with the current resource state',
	413: 'Request payload is too large',
	422: 'Request is well-formed but cannot be processed',
	500: 'Unexpected server error',
	502: 'Upstream provider returned an invalid response or failed',
	503: 'Operation is temporarily deferred and can be retried',
};

export function errorResponses(statuses: readonly number[]): Responses {
	return Object.fromEntries(
		statuses.map((status) => [
			status,
			{
				description: errorDescriptions[status] ?? 'Request failed',
				content: { 'application/json': { schema: errorSchema } },
			},
		]),
	);
}

function operationId(method: string, path: string): string {
	const suffix = path
		.replaceAll(/:([A-Za-z0-9_]+)/g, ' by $1 ')
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join('');
	return `${method.toLowerCase()}${suffix || 'Root'}`;
}

function pathParameters(path: string): ManualParameter[] {
	return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => {
		const name = match[1] ?? '';
		const integer = ['id', 'item_id', 'roomId', 'locationId'].includes(name);
		const schema: ManualSchema = integer
			? positiveIntegerSchema
			: name === 'status'
				? {
						type: 'string',
						enum: [
							'all',
							'payment_pending',
							'payment_confirmed',
							'payment_failed',
							'payment_refunded',
							'shipping_pending',
							'shipping_confirmed',
							'completed',
							'cancelled',
							'expired',
						],
					}
				: name === 'locationType'
					? { type: 'string', enum: ['city'] }
					: { type: 'string', minLength: 1 };
		return {
			in: 'path',
			name,
			required: true,
			description: integer ? 'Positive PostgreSQL integer identifier.' : `${name} route selector.`,
			schema,
		};
	});
}

export type RouteDescriptionInput = {
	method: 'GET' | 'POST' | 'PUT';
	path: string;
	summary: string;
	tag: string;
	security: ApiSecurity;
	success?: number;
	errors?: readonly number[];
	description?: string;
	parameters?: ManualParameter[];
	requestSchema?: ManualSchema;
	requestMediaType?: 'application/json' | 'multipart/form-data';
	responseSchema: ManualSchema;
	responseMediaType?: 'application/json' | 'text/html';
};

export function routeDescription(input: RouteDescriptionInput): DescribeRouteOptions {
	const success = input.success ?? 200;
	const responseMediaType = input.responseMediaType ?? 'application/json';
	const requestBody = input.requestSchema
		? {
				required: true,
				content: {
					[input.requestMediaType ?? 'application/json']: { schema: input.requestSchema },
				},
			}
		: undefined;
	return {
		operationId: operationId(input.method, input.path),
		summary: input.summary,
		description: input.description,
		tags: [input.tag],
		security: securityRequirements[input.security],
		parameters: [...pathParameters(input.path), ...(input.parameters ?? [])],
		requestBody,
		responses: {
			[success]: {
				description: `${input.summary} succeeded`,
				content: { [responseMediaType]: { schema: input.responseSchema } },
			},
			...errorResponses(input.errors ?? []),
		},
	};
}

export function queryParameter(
	name: string,
	description: string,
	schema: ManualSchema = { type: 'string', minLength: 1 },
): ManualParameter {
	return { in: 'query', name, required: true, description, schema };
}
