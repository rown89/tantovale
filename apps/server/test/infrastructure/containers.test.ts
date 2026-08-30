import { afterAll, describe, expect, it } from 'vitest';

import { startInfrastructure, type StartedInfrastructure } from './containers';

describe('local API dependency containers', () => {
	let started: StartedInfrastructure | undefined;

	afterAll(async () => {
		await Promise.allSettled([started?.postgres.stop(), started?.minio.stop(), started?.mailpit.stop()]);
	});

	it('starts disposable Postgres, MinIO, and Mailpit services', async () => {
		started = await startInfrastructure();

		const mailpitApiUrl = `http://${started.mailpit.getHost()}:${started.mailpit.getMappedPort(8025)}`;
		const mailpitResponse = await fetch(`${mailpitApiUrl}/api/v1/info`);

		expect(started.postgres.getMappedPort(5432)).toBeGreaterThan(0);
		expect(started.minio.getMappedPort(9000)).toBeGreaterThan(0);
		expect(mailpitResponse.ok).toBe(true);
	});
});
