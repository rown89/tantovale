import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { routeContracts, type RouteSuite } from './route-registry';

const suiteFiles = {
	documentation: 'test/routes/documentation.test.ts',
	authentication: 'test/routes/authentication.test.ts',
	profiles: 'test/routes/profiles.test.ts',
	addresses: 'test/routes/addresses.test.ts',
	catalog: 'test/routes/catalog.test.ts',
	items: 'test/routes/items.test.ts',
	uploads: 'test/routes/uploads.test.ts',
	favorites: 'test/routes/favorites.test.ts',
	chat: 'test/routes/chat.test.ts',
	proposals: 'test/routes/proposals.test.ts',
	orders: 'test/routes/orders.test.ts',
	'platform-costs': 'test/routes/platform-costs.test.ts',
	shipping: 'test/providers/shippo.test.ts',
	cron: 'test/routes/cron.test.ts',
	webhooks: 'test/routes/webhooks.test.ts',
} as const satisfies Record<RouteSuite, string>;

describe('route suite ownership drift guard', () => {
	it('maps all 15 registry suites to an existing test containing one owned literal route', async () => {
		expect(Object.keys(suiteFiles).sort()).toEqual([...new Set(routeContracts.map((route) => route.suite))].sort());

		for (const [suite, file] of Object.entries(suiteFiles)) {
			const source = await readFile(resolve(process.cwd(), file), 'utf8');
			const ownedPaths = routeContracts.filter((route) => route.suite === suite).map((route) => route.path);
			expect(
				ownedPaths.some((path) => source.includes(path)),
				`${suite}: ${file}`,
			).toBe(true);
		}
	});
});
