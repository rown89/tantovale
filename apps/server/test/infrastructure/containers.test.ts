import { afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import {
	createSerializedCleanupOwner,
	drainBackgroundCleanup,
	registerBackgroundCleanup,
	startInfrastructure,
	startWithDeadline,
	stopInfrastructure,
	type StartedInfrastructure,
} from './containers';

async function fetchReadiness(service: string, url: string): Promise<Response> {
	try {
		return await fetch(url, { signal: AbortSignal.timeout(10_000) });
	} catch (error) {
		throw new Error(`${service} readiness request timed out or failed`, { cause: error });
	}
}

describe('local API dependency containers', () => {
	let started: StartedInfrastructure | undefined;

	afterAll(async () => {
		if (started) {
			await stopInfrastructure(started);
		}
	});

	it('stops a container that completes after its startup deadline', async () => {
		let resolveStart: ((container: { id: string }) => void) | undefined;
		let resolveLateCleanup: (() => void) | undefined;
		const start = new Promise<{ id: string }>((resolve) => {
			resolveStart = resolve;
		});
		const lateCleanup = new Promise<void>((resolve) => {
			resolveLateCleanup = resolve;
		});

		const result = startWithDeadline(
			() => start,
			async () => undefined,
			async () => {
				resolveLateCleanup?.();
			},
			'delayed test image',
			1,
		);

		await expect(result).rejects.toThrow('Timed out starting delayed test image after 1ms');
		resolveStart?.({ id: 'late-container' });
		await lateCleanup;
	});

	it('serializes concurrent cleanup requests for the same container', async () => {
		let resolveCleanup: (() => void) | undefined;
		let cleanupCalls = 0;
		const cleanupFinished = new Promise<void>((resolve) => {
			resolveCleanup = resolve;
		});
		const cleanup = createSerializedCleanupOwner(async () => {
			cleanupCalls += 1;
			await cleanupFinished;
		});

		const immediateCleanup = cleanup();
		const lateCleanup = cleanup();

		await Promise.resolve();
		expect(cleanupCalls).toBe(1);
		resolveCleanup?.();
		await Promise.all([immediateCleanup, lateCleanup]);
	});

	it('reports failed and stalled background cleanup', async () => {
		registerBackgroundCleanup(Promise.reject(new Error('late cleanup failed')));
		await expect(drainBackgroundCleanup(100)).rejects.toThrow('late cleanup failed');

		let resolveStalledCleanup: (() => void) | undefined;
		registerBackgroundCleanup(
			new Promise<void>((resolve) => {
				resolveStalledCleanup = resolve;
			}),
		);
		await expect(drainBackgroundCleanup(1)).rejects.toThrow(
			'Timed out draining background container cleanup after 1ms',
		);
		resolveStalledCleanup?.();
		await drainBackgroundCleanup(100);
	});

	it('starts disposable Postgres, MinIO, and Mailpit services', async () => {
		started = await startInfrastructure();

		const postgres = new Client({
			host: started.postgres.getHost(),
			port: started.postgres.getMappedPort(5432),
			user: 'tantovale_test',
			password: 'tantovale_test',
			database: 'postgres',
			connectionTimeoutMillis: 10_000,
			query_timeout: 10_000,
			statement_timeout: 10_000,
		});
		const mailpitApiUrl = `http://${started.mailpit.getHost()}:${started.mailpit.getMappedPort(8025)}`;
		const minioUrl = `http://${started.minio.getHost()}:${started.minio.getMappedPort(9000)}`;

		try {
			const [mailpitResponse, minioResponse] = await Promise.all([
				fetchReadiness('Mailpit', `${mailpitApiUrl}/api/v1/info`),
				fetchReadiness('MinIO', `${minioUrl}/minio/health/ready`),
			]);
			await postgres.connect();
			const result = await postgres.query('SELECT 1 AS ready');

			expect(started.postgres.getMappedPort(5432)).toBeGreaterThan(0);
			expect(started.minio.getMappedPort(9000)).toBeGreaterThan(0);
			expect(result.rows).toEqual([{ ready: 1 }]);
			expect(minioResponse.ok).toBe(true);
			expect(mailpitResponse.ok).toBe(true);
		} finally {
			await postgres.end();
		}
	}, 300_000);
});
