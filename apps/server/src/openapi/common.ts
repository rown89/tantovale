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
	oneOf: [{ type: 'integer', minimum: 1, maximum: 2_147_483_647 }, { enum: [null] }],
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

function boundedPositiveDecimalPattern(maximum: string): string {
	const alternatives = [`[1-9][0-9]{0,${maximum.length - 2}}`];
	for (let index = 0; index < maximum.length; index += 1) {
		const digit = Number(maximum[index]);
		const minimumDigit = index === 0 ? 1 : 0;
		if (digit <= minimumDigit) continue;
		const prefix = maximum.slice(0, index);
		const suffixLength = maximum.length - index - 1;
		const range = digit - 1 === minimumDigit ? String(minimumDigit) : `[${minimumDigit}-${digit - 1}]`;
		alternatives.push(`${prefix}${range}${suffixLength === 0 ? '' : `[0-9]{${suffixLength}}`}`);
	}
	alternatives.push(maximum);
	return `^(?:${alternatives.join('|')})$`;
}

export const positiveInt4StringSchema = {
	type: 'string',
	pattern: boundedPositiveDecimalPattern('2147483647'),
} as const satisfies ManualSchema;

export const losslessTrustapIdSchema = {
	oneOf: [
		{ type: 'string', pattern: boundedPositiveDecimalPattern('9223372036854775807') },
		{ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
	],
	description: 'Lossless Trustap integer identifier; large values are represented as decimal strings.',
} as const satisfies ManualSchema;

export const inboundTrustapIdSchema = {
	oneOf: [
		{ type: 'string', pattern: boundedPositiveDecimalPattern('9223372036854775807') },
		{
			type: 'integer',
			format: 'int64',
			minimum: 1,
			maximum: Number('9223372036854775807'),
		},
	],
	description:
		'Positive signed-int64 Trustap identifier; the webhook raw numeric token is preserved losslessly before JSON parsing.',
} as const satisfies ManualSchema;

export const emptyArraySchema = {
	type: 'array',
	maxItems: 0,
	items: { not: {} },
} as const satisfies ManualSchema;

const safeMessageCharacters = '[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]';

export const chatMessageInputSchema = {
	type: 'string',
	minLength: 1,
	maxLength: 600,
	pattern: `^(?=[\\s\\S]{1,600}$)(?=[\\s\\S]*\\S)${safeMessageCharacters}+$`,
	description: 'Message must contain 1 to 600 safe JavaScript UTF-16 code units and cannot be whitespace-only.',
} as const satisfies ManualSchema;

export const proposalMessageInputSchema = {
	type: 'string',
	minLength: 1,
	pattern: `^(?=[\\s\\S]*\\S)(?=\\s*[\\s\\S]{1,600}\\s*$)${safeMessageCharacters}+$`,
	description:
		'Message is trimmed before validation; the trimmed value must contain 1 to 600 safe JavaScript UTF-16 code units.',
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
	responseOverrides?: Responses;
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
			...input.responseOverrides,
		},
	};
}

export function jsonResponse(description: string, schema: ManualSchema): Response {
	return { description, content: { 'application/json': { schema } } };
}

export function queryParameter(
	name: string,
	description: string,
	schema: ManualSchema = { type: 'string', minLength: 1 },
): ManualParameter {
	return { in: 'query', name, required: true, description, schema };
}
