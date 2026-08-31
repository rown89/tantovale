import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { routeContracts, type RouteAuth, type RouteSuite } from './route-registry';

const EXPECTED_HANDLER_LAYER_COUNT = 132;

function mountedRouteHandlerLayers(routes: typeof app.routes): string[] {
	// Hono records `app.use()` middleware layers as `ALL`, while concrete methods are handler layers.
	// This baseline detects added or removed handler layers, including an adjacent duplicate registration,
	// but `app.routes` does not expose registration boundaries, so it cannot infer endpoint registrations.
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
	});

	it('matches the target registry consumed by later route suites exactly', () => {
		const mounted = mountedRoutes(app.routes);
		const registered = registeredRoutes();

		expect(routeContracts).toHaveLength(63);
		expect(mounted).toEqual(registered);
	});

	it('registers unique endpoint pairs with valid target classifications for later route suites', () => {
		const registered = registeredRoutes();
		const authValues: readonly RouteAuth[] = ['public', 'cookie', 'cron-secret', 'webhook-basic'];
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
