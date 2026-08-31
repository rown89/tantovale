import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

function isExactSecret(candidate: string, expected: string): boolean {
	const candidateBuffer = Buffer.from(candidate);
	const expectedBuffer = Buffer.from(expected);
	return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function authenticateCronSecret(expected: string): MiddlewareHandler {
	return async (context, next) => {
		const key = context.req.query('key');
		if (key === undefined || key.length === 0 || !isExactSecret(key, expected)) {
			return context.json({ error: 'Invalid key' }, 401);
		}
		await next();
	};
}
