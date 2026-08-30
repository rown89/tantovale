import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { routeContracts, type RouteAuth, type RouteSuite } from './route-registry';

function mountedEndpointRegistrations(routes: typeof app.routes): string[] {
	// Hono records `app.use()` middleware layers as `ALL` and expands route handler stacks into adjacent
	// concrete-method entries. Each contiguous method/path group is one endpoint registration.
	const routeHandlerLayers = routes.filter((route) => route.method !== 'ALL');

	return routeHandlerLayers
		.filter((route, index) => {
			const next = routeHandlerLayers[index + 1];

			return next?.method !== route.method || next.path !== route.path;
		})
		.map((route) => `${route.method.toUpperCase()} ${route.path}`);
}

function mountedRoutes(routes: typeof app.routes): string[] {
	return [...new Set(mountedEndpointRegistrations(routes))].sort();
}

function registeredRoutes(): string[] {
	return routeContracts.map((route) => `${route.method} ${route.path}`).sort();
}

describe('mounted API route target contracts for later route suites', () => {
	it('has no duplicate endpoint registrations before deduplicated target parity', () => {
		const mounted = mountedEndpointRegistrations(app.routes);

		expect(new Set(mounted).size).toBe(mounted.length);
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
