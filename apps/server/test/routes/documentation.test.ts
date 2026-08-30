import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

describe('documentation routes', () => {
	it('serves Scalar at the root', async () => {
		const response = await app.request('http://localhost/');
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('/openapi');
	});

	it('serves a parseable OpenAPI document', async () => {
		const response = await app.request('http://localhost/openapi');
		const document = (await response.json()) as {
			openapi: string;
			info: { title: string };
		};

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(document.openapi).toMatch(/^3\./);
		expect(document.info.title).toBe('Tantovale Honojs');
	});
});
