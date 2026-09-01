import { describe, expect, it } from 'vitest';
import { uniqueSymbol } from 'hono-openapi';

import { app } from '../../src/app';
import { routeContracts, type RouteAuth } from './route-registry';

type OpenApiOperation = {
	operationId?: string;
	summary?: string;
	tags?: string[];
	security?: Array<Record<string, string[]>>;
	parameters?: Array<{ in?: string; name?: string; required?: boolean; schema?: Record<string, unknown> }>;
	requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> };
	responses?: Record<string, { description?: string; content?: Record<string, { schema?: Record<string, unknown> }> }>;
};

type OpenApiDocument = {
	openapi?: string;
	paths: Record<string, Partial<Record<'get' | 'post' | 'put', OpenApiOperation>>>;
	components?: { securitySchemes?: Record<string, Record<string, unknown>> };
};

type JsonSchema = Record<string, unknown>;

function schemaAccepts(schemaValue: unknown, value: unknown): boolean {
	if (schemaValue === true) return true;
	if (schemaValue === false || typeof schemaValue !== 'object' || schemaValue === null) return false;
	const schema = schemaValue as JsonSchema;
	if (schema.not !== undefined && schemaAccepts(schema.not, value)) return false;
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
	if (Array.isArray(schema.oneOf)) {
		return schema.oneOf.filter((candidate) => schemaAccepts(candidate, value)).length === 1;
	}
	if (schema.type === 'null') return value === null;
	if (schema.type === 'string') {
		if (typeof value !== 'string') return false;
		const length = Array.from(value).length;
		if (typeof schema.minLength === 'number' && length < schema.minLength) return false;
		if (typeof schema.maxLength === 'number' && length > schema.maxLength) return false;
		if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) return false;
		return true;
	}
	if (schema.type === 'number' || schema.type === 'integer') {
		if (typeof value !== 'number' || !Number.isFinite(value)) return false;
		if (schema.type === 'integer' && !Number.isInteger(value)) return false;
		if (typeof schema.minimum === 'number' && value < schema.minimum) return false;
		if (typeof schema.maximum === 'number' && value > schema.maximum) return false;
		return true;
	}
	if (schema.type === 'boolean') return typeof value === 'boolean';
	if (schema.type === 'array') {
		if (!Array.isArray(value)) return false;
		if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
		if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
		return schema.items === undefined || value.every((entry) => schemaAccepts(schema.items, entry));
	}
	if (schema.type === 'object') {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
		const objectValue = value as Record<string, unknown>;
		const properties = (schema.properties ?? {}) as Record<string, unknown>;
		if (
			Array.isArray(schema.required) &&
			schema.required.some((property) => typeof property === 'string' && !Object.hasOwn(objectValue, property))
		)
			return false;
		if (
			schema.additionalProperties === false &&
			Object.keys(objectValue).some((key) => !Object.hasOwn(properties, key))
		)
			return false;
		return Object.entries(objectValue).every(
			([key, entry]) => !Object.hasOwn(properties, key) || schemaAccepts(properties[key], entry),
		);
	}
	return true;
}

function findKeywordPaths(value: unknown, keyword: string, path = '$'): string[] {
	if (typeof value !== 'object' || value === null) return [];
	if (Array.isArray(value)) {
		return value.flatMap((entry, index) => findKeywordPaths(entry, keyword, `${path}[${index}]`));
	}
	return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
		...(key === keyword ? [`${path}.${key}`] : []),
		...findKeywordPaths(entry, keyword, `${path}.${key}`),
	]);
}

const EXPECTED_SECURITY: Record<RouteAuth, Array<Record<string, string[]>>> = {
	public: [],
	'optional-access-refresh-cookie': [{}, { accessCookie: [], refreshCookie: [] }],
	'access-refresh-cookie': [{ accessCookie: [], refreshCookie: [] }],
	'refresh-cookie': [{ refreshCookie: [] }],
	'cron-secret': [{ cronKey: [] }],
	'webhook-basic': [{ trustapWebhookBasic: [] }],
};

const EXPECTED_REQUEST_BODY_OPERATIONS = [
	'POST /addresses/auth/add_address_to_profile',
	'PUT /addresses/auth/hide_address_from_profile',
	'PUT /addresses/auth/update_address_to_profile',
	'POST /chat/auth/rooms',
	'POST /chat/auth/rooms/:roomId/messages',
	'POST /favorites/auth/handle',
	'POST /item/auth/buy_now',
	'PUT /item/auth/edit/:id',
	'POST /item/auth/new',
	'POST /item/auth/publish_state',
	'POST /item/auth/user_delete_item',
	'POST /items/auth/user/selling_items',
	'POST /login',
	'POST /orders_proposals/auth/buyer_aborted_proposal',
	'POST /orders_proposals/auth/create',
	'PUT /orders_proposals/auth',
	'POST /password/auth/reset',
	'POST /password/forgot-password',
	'POST /platforms_costs/auth/calculate_platform_costs',
	'PUT /profile/auth',
	'POST /shipment_provider/auth/calculate_shipment_cost',
	'POST /shipment_provider/auth/create_label',
	'POST /signup',
	'POST /uploads/auth/images-item',
	'POST /webhooks/trustap/transaction-update',
].sort();

const expectedRequiredErrors = new Map<string, number[]>();
function requireErrors(statuses: number[], operations: string[]) {
	for (const operation of operations) expectedRequiredErrors.set(operation, statuses);
}

requireErrors([], ['GET /', 'GET /openapi']);
requireErrors(
	[400],
	[
		'GET /locations/search',
		'GET /password/auth/reset-verify-token',
		'POST /password/auth/reset',
		'POST /password/forgot-password',
		'POST /signup',
	],
);
requireErrors(
	[401],
	[
		'GET /chat/auth/rooms',
		'GET /cron/auth/expired-orders-check',
		'GET /cron/auth/expired-proposals-check',
		'GET /cron/auth/sync-transactions',
		'GET /items/auth/user/favorites',
		'POST /logout/auth',
		'GET /profile/auth/profile_active_address_id',
		'POST /refresh/auth',
		'GET /user/auth',
		'GET /verify',
	],
);
requireErrors(
	[404],
	['GET /categories', 'GET /items/:username', 'GET /profile/compact/:username', 'GET /subcategories'],
);
requireErrors(
	[400, 401],
	[
		'GET /chat/auth/rooms/id/:item_id',
		'GET /favorites/auth/check/:item_id',
		'POST /item/auth/new',
		'POST /items/auth/user/selling_items',
		'GET /orders/auth/status/:status',
		'POST /platforms_costs/auth/calculate_platform_costs',
		'POST /shipment_provider/auth/calculate_shipment_cost',
	],
);
requireErrors(
	[400, 404],
	[
		'GET /item/:id',
		'GET /locations/search_by_id/:locationType/:locationId',
		'GET /properties/:id',
		'GET /properties/subcategory_properties/:id',
		'GET /subcategories/:id',
		'GET /subcategories/no_parent/:id',
		'GET /subcategory_properties/:id',
		'GET /subcategory_properties/filter/:id',
		'GET /verify/email',
	],
);
requireErrors(
	[401, 404],
	[
		'GET /addresses/auth/addresses_profile',
		'GET /addresses/auth/default_address',
		'GET /profile/auth',
		'GET /shipment_provider/auth/active_carriers',
	],
);
requireErrors(
	[400, 401, 404],
	[
		'POST /addresses/auth/add_address_to_profile',
		'PUT /addresses/auth/hide_address_from_profile',
		'PUT /addresses/auth/update_address_to_profile',
		'POST /chat/auth/rooms',
		'POST /favorites/auth/handle',
		'POST /item/auth/buy_now',
		'POST /item/auth/publish_state',
		'POST /item/auth/user_delete_item',
		'PUT /item/auth/edit/:id',
		'GET /orders/auth/:id',
		'GET /orders_proposals/auth/:id',
		'GET /orders_proposals/auth/by_item/:item_id',
		'POST /orders_proposals/auth/buyer_aborted_proposal',
		'POST /orders_proposals/auth/create',
		'PUT /orders_proposals/auth',
		'PUT /profile/auth',
		'POST /shipment_provider/auth/create_label',
		'POST /uploads/auth/images-item',
		'POST /webhooks/trustap/transaction-update',
	],
);
requireErrors([400, 401, 403], ['POST /login']);
requireErrors(
	[400, 401, 403, 404],
	['GET /chat/auth/rooms/:roomId/messages', 'POST /chat/auth/rooms/:roomId/messages'],
);

function mountedOperationSet(): string[] {
	return [
		...new Set(app.routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method} ${route.path}`)),
	].sort();
}

function documentedOperations(document: OpenApiDocument): Array<[string, OpenApiOperation]> {
	return Object.entries(document.paths).flatMap(([path, item]) =>
		(['get', 'post', 'put'] as const).flatMap((method) => {
			const operation = item[method];
			if (!operation) return [];
			const honoPath = path.replaceAll(/\{([^}]+)\}/g, ':$1');
			return [[`${method.toUpperCase()} ${honoPath}`, operation] as [string, OpenApiOperation]];
		}),
	);
}

async function generatedOperations(): Promise<{
	document: OpenApiDocument;
	operations: Map<string, OpenApiOperation>;
}> {
	const document = (await (await app.request('http://localhost/openapi')).json()) as OpenApiDocument;
	return { document, operations: new Map(documentedOperations(document)) };
}

function requestSchema(operation: OpenApiOperation | undefined): JsonSchema {
	return operation?.requestBody?.content?.['application/json']?.schema ?? {};
}

function responseSchema(operation: OpenApiOperation | undefined, status: number): JsonSchema {
	return operation?.responses?.[status]?.content?.['application/json']?.schema ?? {};
}

describe('OpenAPI mounted-route parity', () => {
	it('has exactly one description layer on every mounted operation and no invented operation', () => {
		const concrete = app.routes.filter((route) => route.method !== 'ALL');
		const described = concrete.filter((route) => uniqueSymbol in route.handler);
		const runtime = concrete.filter((route) => !(uniqueSymbol in route.handler));

		expect(concrete).toHaveLength(190);
		expect(runtime).toHaveLength(127);
		expect(described).toHaveLength(63);

		for (const operation of mountedOperationSet()) {
			const markers = described.filter((route) => `${route.method} ${route.path}` === operation);
			expect(markers, operation).toHaveLength(1);
		}
	});

	it('matches mounted, registry, and generated operation sets with truthful security and errors', async () => {
		const response = await app.request('http://localhost/openapi');
		const document = (await response.json()) as OpenApiDocument;
		const documented = documentedOperations(document);
		const documentedSet = documented.map(([key]) => key).sort();
		const registrySet = routeContracts.map((route) => `${route.method} ${route.path}`).sort();
		const requestBodyOperations = documented
			.filter(([, operation]) => operation.requestBody)
			.map(([key]) => key)
			.sort();

		expect(response.status).toBe(200);
		expect(documentedSet).toHaveLength(63);
		expect(documentedSet).toEqual(mountedOperationSet());
		expect(documentedSet).toEqual(registrySet);
		expect(new Set(documented.map(([, operation]) => operation.operationId)).size).toBe(63);
		expect(requestBodyOperations).toEqual(EXPECTED_REQUEST_BODY_OPERATIONS);

		for (const contract of routeContracts) {
			const key = `${contract.method} ${contract.path}`;
			const operation = documented.find(([candidate]) => candidate === key)?.[1];
			expect(operation, key).toBeDefined();
			expect(operation?.operationId, key).toBeTruthy();
			expect(operation?.summary, key).toBeTruthy();
			expect(operation?.tags?.length, key).toBeGreaterThan(0);
			expect(operation?.security, key).toEqual(EXPECTED_SECURITY[contract.auth]);
			expect(
				Object.keys(operation?.responses ?? {}).some((status) => Number(status) >= 200 && Number(status) < 300),
				key,
			).toBe(true);
			for (const status of expectedRequiredErrors.get(key) ?? []) {
				expect(operation?.responses?.[status], `${key} ${status}`).toBeDefined();
			}
			const documentedPrimaryErrors = Object.keys(operation?.responses ?? {})
				.map(Number)
				.filter((status) => [400, 401, 403, 404].includes(status))
				.sort((left, right) => left - right);
			expect(documentedPrimaryErrors, `${key} primary errors`).toEqual(expectedRequiredErrors.get(key) ?? []);
		}

		expect(
			routeContracts.reduce<Record<RouteAuth, number>>(
				(counts, route) => ({ ...counts, [route.auth]: counts[route.auth] + 1 }),
				{
					public: 0,
					'optional-access-refresh-cookie': 0,
					'access-refresh-cookie': 0,
					'refresh-cookie': 0,
					'cron-secret': 0,
					'webhook-basic': 0,
				},
			),
		).toEqual({
			public: 20,
			'optional-access-refresh-cookie': 1,
			'access-refresh-cookie': 36,
			'refresh-cookie': 2,
			'cron-secret': 3,
			'webhook-basic': 1,
		});

		expect(document.components?.securitySchemes).toEqual({
			accessCookie: { type: 'apiKey', in: 'cookie', name: 'access_token' },
			refreshCookie: { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
			cronKey: { type: 'apiKey', in: 'query', name: 'key' },
			trustapWebhookBasic: { type: 'http', scheme: 'basic' },
		});

		const operationMap = new Map(documented);
		expect(Object.keys(operationMap.get('GET /')?.responses ?? {})).toEqual(['200']);
		expect(Object.keys(operationMap.get('GET /openapi')?.responses ?? {})).toEqual(['200']);
		expect(operationMap.get('GET /user/auth')?.responses?.['404']).toBeUndefined();
		expect(operationMap.get('GET /profile/auth/profile_active_address_id')?.responses?.['404']).toBeUndefined();
		for (const [key, statuses] of [
			['POST /signup', [409, 422]],
			['POST /item/auth/buy_now', [409]],
			['POST /shipment_provider/auth/create_label', [409, 502]],
			['POST /uploads/auth/images-item', [413]],
			['POST /webhooks/trustap/transaction-update', [409, 413, 503]],
		] as const) {
			for (const status of statuses)
				expect(operationMap.get(key)?.responses?.[status], `${key} ${status}`).toBeDefined();
		}
	});

	it('documents compatibility-sensitive request, parameter, money, and response contracts', async () => {
		const document = (await (await app.request('http://localhost/openapi')).json()) as OpenApiDocument;
		const operations = new Map(documentedOperations(document));
		const itemId = operations.get('GET /item/:id')?.parameters?.find((parameter) => parameter.name === 'id');
		const signup = operations.get('POST /signup');
		const shipment = operations.get('POST /shipment_provider/auth/calculate_shipment_cost');
		const order = operations.get('GET /orders/auth/:id');
		const webhook = operations.get('POST /webhooks/trustap/transaction-update');
		const platformCosts = operations.get('POST /platforms_costs/auth/calculate_platform_costs');
		const refresh = operations.get('POST /refresh/auth');
		const logout = operations.get('POST /logout/auth');

		expect(itemId).toMatchObject({ in: 'path', required: true, schema: { type: 'integer', minimum: 1 } });
		expect(signup?.responses?.['201']).toBeDefined();
		expect(shipment?.responses?.['200']?.content?.['application/json']?.schema).toMatchObject({
			properties: {
				rates: {
					items: {
						properties: {
							shipment_label_id: {
								description:
									'A Shippo shipment object ID used to retrieve rates; it is not a purchased label transaction ID.',
							},
						},
					},
				},
			},
		});
		expect(order?.responses?.['200']?.content?.['application/json']?.schema).toMatchObject({
			properties: { payment_transaction_id: { oneOf: [{ type: 'string' }, { type: 'integer' }] } },
		});
		expect(webhook?.requestBody?.content?.['application/json']?.schema).toMatchObject({
			properties: {
				transaction_id: {
					oneOf: [
						{ type: 'string', pattern: expect.any(String) },
						{ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
					],
				},
			},
		});
		expect(platformCosts?.requestBody?.content?.['application/json']?.schema).toMatchObject({
			required: ['price', 'shipping_price'],
			properties: {
				price: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
				shipping_price: { type: 'integer', minimum: 0, maximum: 2_147_483_647 },
			},
		});
		expect(platformCosts?.responses?.['200']?.content?.['application/json']?.schema).toMatchObject({
			required: ['platform_charge', 'payment_provider_charge', 'proposalExpireTime'],
			properties: {
				platform_charge: { type: 'integer', minimum: 0 },
				payment_provider_charge: { type: 'integer', minimum: 0 },
				proposalExpireTime: { type: 'number', minimum: 0 },
			},
		});
		expect(refresh?.requestBody).toBeUndefined();
		expect(logout?.requestBody).toBeUndefined();
	});

	it('emits OpenAPI 3.1 null unions and an exact privacy-safe compact profile', async () => {
		const { document, operations } = await generatedOperations();
		expect(document.openapi).toBe('3.1.0');
		expect(findKeywordPaths(document, 'nullable')).toEqual([]);

		const activeAddress = responseSchema(operations.get('GET /profile/auth/profile_active_address_id'), 200);
		expect(activeAddress).toEqual({
			oneOf: [{ type: 'integer', minimum: 1, maximum: 2_147_483_647 }, { enum: [null] }],
		});
		expect(schemaAccepts(activeAddress, null)).toBe(true);
		expect(schemaAccepts(activeAddress, 41)).toBe(true);

		const chatMessage = responseSchema(operations.get('GET /chat/auth/rooms/:roomId/messages'), 200)
			.items as JsonSchema;
		const chatProperties = chatMessage.properties as Record<string, unknown>;
		for (const [field, example] of [
			['order_proposal_id', 41],
			['read_at', '2026-09-01T10:30:00.000Z'],
			['metadata', { type: 'proposal' }],
		] as const) {
			expect(schemaAccepts(chatProperties[field], null), field).toBe(true);
			expect(schemaAccepts(chatProperties[field], example), field).toBe(true);
		}

		const itemSummary = responseSchema(operations.get('GET /items/:username'), 200).items as JsonSchema;
		const itemProperties = itemSummary.properties as Record<string, unknown>;
		for (const field of ['image', 'imageUrl']) {
			expect(schemaAccepts(itemProperties[field], null), field).toBe(true);
			expect(schemaAccepts(itemProperties[field], 'https://images.test/item.png'), field).toBe(true);
		}

		const label = (
			responseSchema(operations.get('POST /shipment_provider/auth/create_label'), 201).properties as Record<
				string,
				JsonSchema
			>
		).label;
		expect(label).toBeDefined();
		const labelProperties = label?.properties as Record<string, unknown>;
		for (const field of ['tracking_number', 'tracking_url']) {
			expect(schemaAccepts(labelProperties[field], null), field).toBe(true);
		}

		const compact = responseSchema(operations.get('GET /profile/compact/:username'), 200);
		expect(Object.keys(compact.properties as Record<string, unknown>).sort()).toEqual([
			'created_at',
			'email_verified',
			'id',
			'location',
			'phone_verified',
			'profile_id',
			'selling_items',
		]);
		expect([...(compact.required as string[])].sort()).toEqual([
			'created_at',
			'email_verified',
			'id',
			'location',
			'phone_verified',
			'profile_id',
			'selling_items',
		]);
		expect(compact.additionalProperties).toBe(false);
		expect((compact.properties as Record<string, JsonSchema>).location).toEqual({
			type: 'object',
			properties: {
				city: {
					type: 'object',
					properties: { id: { type: 'integer', minimum: 1, maximum: 2_147_483_647 }, name: { type: 'string' } },
					required: ['id', 'name'],
					additionalProperties: false,
				},
				province: {
					type: 'object',
					properties: { id: { type: 'integer', minimum: 1, maximum: 2_147_483_647 }, name: { type: 'string' } },
					required: ['id', 'name'],
					additionalProperties: false,
				},
			},
			required: ['city', 'province'],
			additionalProperties: false,
		});
	});

	it('does not duplicate cron secrets and documents route-specific legacy error bodies', async () => {
		const { operations } = await generatedOperations();
		for (const key of [
			'GET /cron/auth/expired-orders-check',
			'GET /cron/auth/expired-proposals-check',
			'GET /cron/auth/sync-transactions',
		]) {
			expect(
				operations.get(key)?.parameters?.some((parameter) => parameter.name === 'key'),
				key,
			).toBe(false);
			expect(operations.get(key)?.security).toEqual([{ cronKey: [] }]);
		}

		expect(responseSchema(operations.get('GET /orders/auth/status/:status'), 400)).toEqual({
			type: 'array',
			maxItems: 0,
			items: { not: {} },
		});
		expect(responseSchema(operations.get('GET /chat/auth/rooms'), 500)).toEqual({
			type: 'array',
			maxItems: 0,
			items: { not: {} },
		});
		expect(responseSchema(operations.get('GET /orders/auth/status/:status'), 401)).toMatchObject({
			type: 'object',
		});
	});

	it('mirrors the complete Trustap v1 webhook input contract without accepting lossy IDs or v2 markers', async () => {
		const { operations } = await generatedOperations();
		const webhook = requestSchema(operations.get('POST /webhooks/trustap/transaction-update'));
		const properties = webhook.properties as Record<string, JsonSchema>;
		const timestampFields = [
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
		];

		expect(webhook.additionalProperties).toBe(false);
		expect(Object.keys(properties).sort()).toEqual(
			['event', 'transaction_id', 'status', ...timestampFields, 'code', 'target_id', 'target_preview'].sort(),
		);
		for (const field of timestampFields) {
			expect(properties[field], field).toEqual({ type: 'string', format: 'date-time' });
			expect(schemaAccepts(properties[field], null), `${field} null`).toBe(false);
		}
		for (const marker of ['code', 'target_id', 'target_preview']) {
			expect(schemaAccepts(properties[marker], 'forbidden'), marker).toBe(false);
		}

		const base = { event: 'transaction_updated', transaction_id: '9223372036854775807', status: 'paid' };
		const allTimestamps = Object.fromEntries(timestampFields.map((field) => [field, '2026-09-01T10:30:00.000Z']));
		expect(schemaAccepts(webhook, { ...base, ...allTimestamps })).toBe(true);
		expect(schemaAccepts(webhook, { ...base, transaction_id: Number.MAX_SAFE_INTEGER })).toBe(true);
		for (const transaction_id of [0, '0', '01', 9_007_199_254_740_992, '9223372036854775808']) {
			expect(schemaAccepts(webhook, { ...base, transaction_id }), String(transaction_id)).toBe(false);
		}
		expect(schemaAccepts(webhook, { ...base, code: 'tx.paid' })).toBe(false);
		expect(properties.transaction_id).toEqual({
			oneOf: [
				{ type: 'string', pattern: expect.any(String) },
				{ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
			],
			description: expect.stringContaining('Lossless Trustap'),
		});
	});

	it('mirrors request-validator boundaries for auth, addresses, messages, uploads, and money', async () => {
		const { operations } = await generatedOperations();
		const login = requestSchema(operations.get('POST /login'));
		const signup = requestSchema(operations.get('POST /signup'));
		const loginPassword = (login.properties as Record<string, JsonSchema>).password;
		const signupPassword = (signup.properties as Record<string, JsonSchema>).password;
		expect(loginPassword).toBeDefined();
		expect(signupPassword).toBeDefined();
		expect(schemaAccepts(loginPassword, 'é'.repeat(50))).toBe(true);
		expect(schemaAccepts(loginPassword, 'x'.repeat(101))).toBe(false);
		expect(String(loginPassword?.description ?? '')).not.toContain('72');
		expect(String(signupPassword?.description ?? '')).toContain('72');

		const addAddress = requestSchema(operations.get('POST /addresses/auth/add_address_to_profile'));
		const updateAddress = requestSchema(operations.get('PUT /addresses/auth/update_address_to_profile'));
		const hideAddress = requestSchema(operations.get('PUT /addresses/auth/hide_address_from_profile'));
		expect(schemaAccepts((addAddress.properties as Record<string, unknown>).phone, '')).toBe(true);
		for (const schema of [updateAddress, hideAddress]) {
			const addressId = (schema.properties as Record<string, unknown>).address_id;
			expect(schemaAccepts(addressId, -1)).toBe(true);
			expect(schemaAccepts(addressId, 1.5)).toBe(true);
		}

		const chatMessage = (
			requestSchema(operations.get('POST /chat/auth/rooms/:roomId/messages')).properties as Record<string, unknown>
		).message;
		const proposalMessage = (
			requestSchema(operations.get('POST /orders_proposals/auth/create')).properties as Record<string, unknown>
		).message;
		for (const schema of [chatMessage, proposalMessage]) {
			expect(schemaAccepts(schema, 'safe\nmessage')).toBe(true);
			expect(schemaAccepts(schema, ' \t\n ')).toBe(false);
			expect(schemaAccepts(schema, 'unsafe\u0000message')).toBe(false);
		}
		expect(schemaAccepts(chatMessage, 'x'.repeat(601))).toBe(false);
		expect(schemaAccepts(proposalMessage, `${' '.repeat(400)}x${' '.repeat(400)}`)).toBe(true);
		expect(schemaAccepts(proposalMessage, 'x'.repeat(601))).toBe(false);

		const upload = operations.get('POST /uploads/auth/images-item')?.requestBody?.content?.['multipart/form-data']
			?.schema as JsonSchema;
		const uploadItemId = (upload.properties as Record<string, unknown>).item_id;
		expect(schemaAccepts(uploadItemId, '2147483647')).toBe(true);
		for (const id of ['0', '01', '2147483648']) expect(schemaAccepts(uploadItemId, id), id).toBe(false);

		const platformPrice = (
			requestSchema(operations.get('POST /platforms_costs/auth/calculate_platform_costs')).properties as Record<
				string,
				JsonSchema
			>
		).price;
		expect(platformPrice).toEqual({
			type: 'integer',
			minimum: 1,
			maximum: 2_147_483_647,
			description: 'Amount in integer euro cents.',
		});
	});
});
