import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { routeContracts } from './route-registry';

function mountedRoutes(routes: typeof app.routes): string[] {
	return [
		...new Set(
			routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method.toUpperCase()} ${route.path}`),
		),
	].sort();
}

function registeredRoutes(): string[] {
	return routeContracts.map((route) => `${route.method} ${route.path}`).sort();
}

describe('mounted API route contracts', () => {
	it('matches the registered public API surface exactly', () => {
		const mounted = mountedRoutes(app.routes);
		const registered = registeredRoutes();

		expect(routeContracts).toHaveLength(63);
		expect(mounted).toEqual(registered);
	});

	it('registers unique method and path pairs with complete classifications', () => {
		const registered = registeredRoutes();

		expect(new Set(registered).size).toBe(registered.length);
		expect(routeContracts.every((route) => route.auth.length > 0 && route.suite.length > 0)).toBe(true);
	});
});
