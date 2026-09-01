import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { routeContracts, type RouteAuth, type RouteSuite } from './route-registry';

const EXPECTED_OPERATION_PAIR_COUNT = 63;
const EXPECTED_RUNTIME_HANDLER_LAYER_COUNT = 127;
const EXPECTED_DESCRIPTION_LAYER_COUNT = 63;
const EXPECTED_HANDLER_LAYER_COUNT = EXPECTED_RUNTIME_HANDLER_LAYER_COUNT + EXPECTED_DESCRIPTION_LAYER_COUNT;

function mountedRouteHandlerLayers(routes: typeof app.routes): string[] {
	// Hono records `app.use()` middleware layers as `ALL`, while concrete methods are handler layers.
	// One operation pair can have several same-method/path layers (for example auth, bodyLimit, and handler),
	// The 127 executable layers plus 63 one-per-operation description layers are intentionally
	// distinct from the 63 unique operation pairs below.
	return routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method.toUpperCase()} ${route.path}`);
}

function mountedRoutes(routes: typeof app.routes): string[] {
	return [...new Set(mountedRouteHandlerLayers(routes))].sort();
}

function registeredRoutes(): string[] {
	return routeContracts.map((route) => `${route.method} ${route.path}`).sort();
}

describe('mounted API route target contracts for later route suites', () => {
	it('preserves the raw non-ALL Hono handler-layer baseline', () => {
		const mounted = mountedRouteHandlerLayers(app.routes);

		expect(mounted).toHaveLength(EXPECTED_HANDLER_LAYER_COUNT);
		expect(new Set(mounted)).toHaveLength(EXPECTED_OPERATION_PAIR_COUNT);
	});

	it('matches the target registry consumed by later route suites exactly', () => {
		const mounted = mountedRoutes(app.routes);
		const registered = registeredRoutes();

		expect(routeContracts).toHaveLength(EXPECTED_OPERATION_PAIR_COUNT);
		expect(mounted).toEqual(registered);
	});

	it('registers unique endpoint pairs with valid target classifications for later route suites', () => {
		const registered = registeredRoutes();
		const authValues: readonly RouteAuth[] = [
			'public',
			'optional-access-refresh-cookie',
			'access-refresh-cookie',
			'refresh-cookie',
			'cron-secret',
			'webhook-basic',
		];
		const suiteValues: readonly RouteSuite[] = [
			'addresses',
			'authentication',
			'catalog',
			'chat',
			'cron',
			'documentation',
			'favorites',
			'items',
			'orders',
			'platform-costs',
			'profiles',
			'proposals',
			'shipping',
			'uploads',
			'webhooks',
		];

		expect(new Set(registered).size).toBe(registered.length);
		expect(routeContracts.every((route) => authValues.includes(route.auth) && suiteValues.includes(route.suite))).toBe(
			true,
		);
	});
});
