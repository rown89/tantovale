import { Writable } from 'node:stream';

import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { getLogger } from 'hono-pino';
import { describe, expect, it } from 'vitest';

import { pinoLogger } from '../../src/middlewares/pino-loggers';

describe('request logger security', () => {
	it('logs only safe request metadata and removes secrets from real middleware bindings', async () => {
		const chunks: string[] = [];
		const destination = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(String(chunk));
				callback();
			},
		});
		const app = new Hono();
		app.use(requestId({ generator: () => 'request-safe-id' }));
		app.use(pinoLogger({ destination, level: 'info' }));
		app.get('/logger-probe', (c) => {
			const providerError = Object.assign(new Error('provider failed'), {
				request: { headers: { authorization: 'error-auth-sentinel', cookie: 'error-cookie-sentinel' } },
				response: { headers: { 'set-cookie': 'error-response-sentinel' } },
			});
			getLogger(c).info(
				{
					req: { headers: { Cookie: 'cookie-sentinel', Authorization: 'bearer-sentinel' } },
					res: { headers: { 'Set-Cookie': 'response-cookie-sentinel' } },
					provider: { headers: { authorization: 'basic-webhook-sentinel' } },
				},
				'probe',
			);
			getLogger(c).error({ err: providerError }, 'provider probe failed');
			c.header('Set-Cookie', 'access_token=response-header-sentinel; HttpOnly');
			return c.text('ok');
		});

		const response = await app.request('/logger-probe', {
			headers: {
				Cookie: 'access_token=request-cookie-sentinel; refresh_token=refresh-cookie-sentinel',
				Authorization: 'Bearer request-bearer-sentinel',
			},
		});
		await new Promise<void>((resolve) => setImmediate(resolve));
		const logs = chunks.join('');
		const containsSensitiveData = [
			'cookie-sentinel',
			'bearer-sentinel',
			'response-cookie-sentinel',
			'basic-webhook-sentinel',
			'response-header-sentinel',
			'request-cookie-sentinel',
			'refresh-cookie-sentinel',
			'request-bearer-sentinel',
			'error-auth-sentinel',
			'error-cookie-sentinel',
			'error-response-sentinel',
		].some((value) => logs.includes(value));
		const containsSensitiveHeaderName = /cookie|authorization|set-cookie/i.test(logs);

		expect(response.status).toBe(200);
		expect(containsSensitiveData).toBe(false);
		expect(containsSensitiveHeaderName).toBe(false);
		expect(logs).toContain('GET');
		expect(logs).toContain('/logger-probe');
		expect(logs).toContain('200');
		expect(logs).toContain('request-safe-id');
	});
});
