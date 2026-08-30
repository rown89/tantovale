import { describe, expect, it } from 'vitest';

import {
	assertDisposableDatabaseName,
	buildServerEnvironment,
	createResourceNames,
	getWorkerIndex,
	type TestRuntime,
} from './runtime';

const runtime: TestRuntime = {
	runId: 'a1b2c3d4',
	workerCount: 4,
	resourceNames: {
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
	},
	postgres: {
		host: '127.0.0.1',
		port: 54321,
		user: 'test-user',
		password: 'test-password',
	},
	minio: {
		endpoint: 'http://127.0.0.1:9000',
		accessKey: 'test-minio-key',
		secretKey: 'test-minio-secret',
	},
	mailpit: {
		smtpHost: '127.0.0.1',
		smtpPort: 1025,
		apiUrl: 'http://127.0.0.1:8025',
	},
};

describe('test runtime resources', () => {
	it.each(['tantovale_dev', 'tantovale', 'postgres', 'template1', ''])('refuses non-disposable database %j', (name) => {
		expect(() => assertDisposableDatabaseName(name)).toThrow(/disposable test database/i);
	});

	it.each([
		'tantovale_test_a1b2c3d4_template',
		'tantovale_test_a1b2c3d4_worker_1',
		'tantovale_test_a1b2c3d4_worker_99',
	])('accepts disposable database %j', (name) => {
		expect(() => assertDisposableDatabaseName(name)).not.toThrow();
	});

	it.each([
		'not_tantovale_test_a1b2c3d4_template',
		'tantovale_test_A1B2C3D4_template',
		'tantovale_test_a1b2-c3d4_template',
		'tantovale_test_a1b2c3d4_worker_0',
		'tantovale_test_a1b2c3d4_template_extra',
	])('refuses dangerous near-miss database %j', (name) => {
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

	it.each(['a1b2c3d', 'g1b2c3d4', 'abcdefghijklmnopqrstuvwxyz0123456789'])(
		'accepts lowercase alphanumeric run id %j',
		(runId) => {
			expect(() => createResourceNames(runId, 1)).not.toThrow();
		},
	);

	it.each(['', 'A1B2C3D4', 'a1b2-c3d4'])('rejects invalid run id %j', (runId) => {
		expect(() => createResourceNames(runId, 4)).toThrow(/runId must be nonempty lowercase alphanumeric/i);
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects unsafe worker count %s when creating resource names',
		(workerCount) => {
			expect(() => createResourceNames('a1b2c3d4', workerCount)).toThrow(
				/workerCount must be a positive safe integer/i,
			);
		},
	);

	it('accepts a worker count above the configured suite size', () => {
		expect(createResourceNames('a1b2c3d4', 33).workerDatabases).toHaveLength(33);
	});

	it('maps Vitest worker ids to zero-based worker indexes', () => {
		expect(getWorkerIndex(undefined, 4)).toBe(0);
		expect(getWorkerIndex('1', 4)).toBe(0);
		expect(getWorkerIndex('4', 4)).toBe(3);
	});

	it.each(['0', '-1', '1.5', '5', 'abc', ''])('rejects invalid Vitest worker id %j', (workerId) => {
		expect(() => getWorkerIndex(workerId, 4)).toThrow(/Invalid Vitest worker id/i);
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects unsafe worker count %s when resolving a worker index',
		(workerCount) => {
			expect(() => getWorkerIndex('1', workerCount)).toThrow(/workerCount must be a positive safe integer/i);
		},
	);

	it('resolves an index above the configured suite size', () => {
		expect(getWorkerIndex('33', 33)).toBe(32);
	});

	it('refuses an unsafe database when building server environment', () => {
		expect(() => buildServerEnvironment(runtime, 'tantovale_dev', 'tantovale-test-bucket')).toThrow(
			/disposable test database/i,
		);
	});

	it('maps local test infrastructure to a fake-safe server environment', () => {
		const environment = buildServerEnvironment(
			runtime,
			'tantovale_test_a1b2c3d4_worker_1',
			'tantovale-test-a1b2c3d4-worker-1',
		);

		expect(environment).toMatchObject({
			NODE_ENV: 'test',
			LOG_LEVEL: 'silent',
			DATABASE_HOST: '127.0.0.1',
			DATABASE_PORT: '54321',
			POSTGRES_DB: 'tantovale_test_a1b2c3d4_worker_1',
			AWS_ENDPOINT: 'http://127.0.0.1:9000',
			AWS_ACCESS_KEY: 'test-minio-key',
			AWS_SECRET_ACCESS_KEY: 'test-minio-secret',
			AWS_BUCKET_NAME: 'tantovale-test-a1b2c3d4-worker-1',
			SMTP_HOST: '127.0.0.1',
			SMTP_PORT: '1025',
			PAYMENT_PROVIDER_API_URL: 'http://127.0.0.1:9',
			SHIPPING_PROVIDER_API_KEY: 'shippo-test-key',
			ACCESS_TOKEN_SECRET: 'access-test-secret-at-least-32-characters',
		});
	});
});
