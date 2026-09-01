import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { routeContracts, type RouteSuite } from './route-registry';

type OwnedSuite = { file: string; operations: readonly string[] };

// This manifest assigns every mounted operation to the suite responsible for it. It is an
// auditable ownership/drift guard, not a claim that a route has exhaustive behavioral coverage.
const suiteOwnership = {
	documentation: {
		file: 'test/routes/documentation.test.ts',
		operations: ['GET /', 'GET /openapi'],
	},
	authentication: {
		file: 'test/routes/authentication.test.ts',
		operations: [
			'POST /login',
			'POST /logout/auth',
			'GET /password/auth/reset-verify-token',
			'POST /password/auth/reset',
			'POST /password/forgot-password',
			'POST /refresh/auth',
			'POST /signup',
			'GET /user/auth',
			'GET /verify',
			'GET /verify/email',
		],
	},
	profiles: {
		file: 'test/routes/profiles.test.ts',
		operations: [
			'GET /profile/auth',
			'GET /profile/auth/profile_active_address_id',
			'GET /profile/compact/:username',
			'PUT /profile/auth',
		],
	},
	addresses: {
		file: 'test/routes/addresses.test.ts',
		operations: [
			'GET /addresses/auth/addresses_profile',
			'GET /addresses/auth/default_address',
			'POST /addresses/auth/add_address_to_profile',
			'PUT /addresses/auth/hide_address_from_profile',
			'PUT /addresses/auth/update_address_to_profile',
		],
	},
	catalog: {
		file: 'test/routes/catalog.test.ts',
		operations: [
			'GET /categories',
			'GET /locations/search',
			'GET /locations/search_by_id/:locationType/:locationId',
			'GET /properties/:id',
			'GET /properties/subcategory_properties/:id',
			'GET /subcategories',
			'GET /subcategories/:id',
			'GET /subcategories/no_parent/:id',
			'GET /subcategory_properties/:id',
			'GET /subcategory_properties/filter/:id',
		],
	},
	items: {
		file: 'test/routes/items.test.ts',
		operations: [
			'GET /item/:id',
			'POST /item/auth/buy_now',
			'POST /item/auth/new',
			'POST /item/auth/publish_state',
			'POST /item/auth/user_delete_item',
			'PUT /item/auth/edit/:id',
			'GET /items/:username',
			'GET /items/auth/user/favorites',
			'POST /items/auth/user/selling_items',
		],
	},
	uploads: { file: 'test/routes/uploads.test.ts', operations: ['POST /uploads/auth/images-item'] },
	favorites: {
		file: 'test/routes/favorites.test.ts',
		operations: ['GET /favorites/auth/check/:item_id', 'POST /favorites/auth/handle'],
	},
	chat: {
		file: 'test/routes/chat.test.ts',
		operations: [
			'GET /chat/auth/rooms',
			'GET /chat/auth/rooms/:roomId/messages',
			'GET /chat/auth/rooms/id/:item_id',
			'POST /chat/auth/rooms',
			'POST /chat/auth/rooms/:roomId/messages',
		],
	},
	proposals: {
		file: 'test/routes/proposals.test.ts',
		operations: [
			'GET /orders_proposals/auth/:id',
			'GET /orders_proposals/auth/by_item/:item_id',
			'POST /orders_proposals/auth/buyer_aborted_proposal',
			'POST /orders_proposals/auth/create',
			'PUT /orders_proposals/auth',
		],
	},
	orders: {
		file: 'test/routes/orders.test.ts',
		operations: ['GET /orders/auth/:id', 'GET /orders/auth/status/:status'],
	},
	'platform-costs': {
		file: 'test/routes/platform-costs.test.ts',
		operations: ['POST /platforms_costs/auth/calculate_platform_costs'],
	},
	shipping: {
		file: 'test/providers/shippo.test.ts',
		operations: [
			'GET /shipment_provider/auth/active_carriers',
			'POST /shipment_provider/auth/calculate_shipment_cost',
			'POST /shipment_provider/auth/create_label',
		],
	},
	cron: {
		file: 'test/routes/cron.test.ts',
		operations: [
			'GET /cron/auth/expired-orders-check',
			'GET /cron/auth/expired-proposals-check',
			'GET /cron/auth/sync-transactions',
		],
	},
	webhooks: {
		file: 'test/routes/webhooks.test.ts',
		operations: ['POST /webhooks/trustap/transaction-update'],
	},
} as const satisfies Record<RouteSuite, OwnedSuite>;

const suiteAnchors = {
	documentation: 'GET /openapi',
	authentication: 'POST /login',
	profiles: 'GET /profile/auth',
	addresses: 'GET /addresses/auth/default_address',
	catalog: 'GET /categories',
	items: 'POST /item/auth/new',
	uploads: 'POST /uploads/auth/images-item',
	favorites: 'GET /favorites/auth/check/:item_id',
	chat: 'GET /chat/auth/rooms',
	proposals: 'POST /orders_proposals/auth/create',
	orders: 'GET /orders/auth/:id',
	'platform-costs': 'POST /platforms_costs/auth/calculate_platform_costs',
	shipping: 'POST /shipment_provider/auth/create_label',
	cron: 'GET /cron/auth/sync-transactions',
	webhooks: 'POST /webhooks/trustap/transaction-update',
} as const satisfies Record<RouteSuite, string>;

describe('route test-suite ownership manifest', () => {
	it('assigns every registry operation exactly once to an existing owner suite', async () => {
		const declared = Object.entries(suiteOwnership)
			.flatMap(([suite, owner]) => owner.operations.map((operation) => ({ operation, suite })))
			.sort((left, right) => left.operation.localeCompare(right.operation));
		const registry = routeContracts
			.map((route) => ({ operation: `${route.method} ${route.path}`, suite: route.suite }))
			.sort((left, right) => left.operation.localeCompare(right.operation));

		expect(declared).toHaveLength(63);
		expect(new Set(declared.map(({ operation }) => operation)).size).toBe(63);
		expect(declared).toEqual(registry);

		for (const [suite, owner] of Object.entries(suiteOwnership)) {
			const source = await readFile(resolve(process.cwd(), owner.file), 'utf8');
			const anchorOperation = suiteAnchors[suite as RouteSuite];
			const anchorPath = anchorOperation.slice(anchorOperation.indexOf(' ') + 1);
			expect(owner.operations, `${suite}: anchor ownership`).toContain(anchorOperation);
			expect(
				registry.some(({ operation, suite: routeSuite }) => operation === anchorOperation && routeSuite === suite),
				`${suite}: registry anchor`,
			).toBe(true);
			expect(source, `${suite}: literal route anchor`).toContain(anchorPath);
			expect(source, `${suite}: ${owner.file}`).toContain('describe(');
			expect(source, `${suite}: ${owner.file}`).toContain("it('");
		}
	});
});
