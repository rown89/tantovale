import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

describe('documentation routes', () => {
	it('serves Scalar at the root', async () => {
		const response = await app.request('http://localhost/');
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain("Scalar.createApiReference('#app'");
		expect(html).toContain('"url": "/openapi"');
	});

	it('serves a parseable OpenAPI document', async () => {
		const response = await app.request('http://localhost/openapi');

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');

		const document = (await response.json()) as {
			openapi: string;
			info: { title: string };
		};

		expect(document.openapi).toBe('3.1.0');
		expect(document.info.title).toBe('Tantovale Honojs');
	});
});
