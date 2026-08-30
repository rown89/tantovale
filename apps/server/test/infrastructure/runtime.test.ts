import { describe, expect, it } from 'vitest';

import { assertDisposableDatabaseName, createResourceNames } from './runtime';

describe('test runtime resources', () => {
	it.each(['tantovale_dev', 'tantovale', 'postgres', 'template1', ''])('refuses non-disposable database %j', (name) => {
		expect(() => assertDisposableDatabaseName(name)).toThrow(/disposable test database/i);
	});

	it('creates deterministic template, worker database, and bucket names', () => {
		expect(createResourceNames('a1b2c3d4', 4)).toEqual({
			templateDatabase: 'tantovale_test_a1b2c3d4_template',
			workerDatabases: [
				'tantovale_test_a1b2c3d4_worker_1',
				'tantovale_test_a1b2c3d4_worker_2',
				'tantovale_test_a1b2c3d4_worker_3',
				'tantovale_test_a1b2c3d4_worker_4',
			],
			workerBuckets: [
				'tantovale-test-a1b2c3d4-worker-1',
				'tantovale-test-a1b2c3d4-worker-2',
				'tantovale-test-a1b2c3d4-worker-3',
				'tantovale-test-a1b2c3d4-worker-4',
			],
		});
	});
});
