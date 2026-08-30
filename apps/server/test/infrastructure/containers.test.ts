import { afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import { startInfrastructure, stopInfrastructure, type StartedInfrastructure } from './containers';

describe('local API dependency containers', () => {
	let started: StartedInfrastructure | undefined;

	afterAll(async () => {
		if (started) {
			await stopInfrastructure(started);
		}
	});

	it('starts disposable Postgres, MinIO, and Mailpit services', async () => {
		started = await startInfrastructure();

		const postgres = new Client({
			host: started.postgres.getHost(),
			port: started.postgres.getMappedPort(5432),
			user: 'tantovale_test',
			password: 'tantovale_test',
			database: 'postgres',
		});
		const mailpitApiUrl = `http://${started.mailpit.getHost()}:${started.mailpit.getMappedPort(8025)}`;
		const minioUrl = `http://${started.minio.getHost()}:${started.minio.getMappedPort(9000)}`;

		try {
			const [mailpitResponse, minioResponse] = await Promise.all([
				fetch(`${mailpitApiUrl}/api/v1/info`),
				fetch(`${minioUrl}/minio/health/ready`),
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
