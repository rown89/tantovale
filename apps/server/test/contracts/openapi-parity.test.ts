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
	paths: Record<string, Partial<Record<'get' | 'post' | 'put', OpenApiOperation>>>;
	components?: { securitySchemes?: Record<string, Record<string, unknown>> };
};

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
		const requestBodyOperations = documented.filter(([, operation]) => operation.requestBody).map(([key]) => key).sort();

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
				transaction_id: { oneOf: [{ type: 'string', pattern: '^[0-9]+$' }, { type: 'integer' }] },
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
});
