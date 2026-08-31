import { timingSafeEqual } from 'node:crypto';
import { TextDecoder } from 'node:util';
import type { MiddlewareHandler } from 'hono';

import { environment } from '#utils/constants';

function decodeCanonicalBase64(encoded: string): string | undefined {
	if (!/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u.test(encoded)) return undefined;

	try {
		const bytes = Buffer.from(encoded, 'base64');
		if (bytes.toString('base64') !== encoded) return undefined;
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

function timingSafeStringEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) return false;
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidTrustapBasicAuth(authorization: string | undefined): boolean {
	if (!authorization?.startsWith('Basic ')) return false;
	const decoded = decodeCanonicalBase64(authorization.slice('Basic '.length));
	if (decoded === undefined) return false;
	const separator = decoded.indexOf(':');
	if (separator < 0) return false;

	const usernameMatches = timingSafeStringEqual(
		decoded.slice(0, separator),
		environment.PAYMENT_PROVIDER_WEBHOOK_USERNAME,
	);
	const passwordMatches = timingSafeStringEqual(
		decoded.slice(separator + 1),
		environment.PAYMENT_PROVIDER_WEBHOOK_SECRET,
	);
	return usernameMatches && passwordMatches;
}

export const authenticateTrustapWebhook: MiddlewareHandler = async (context, next) => {
	if (!hasValidTrustapBasicAuth(context.req.header('authorization'))) {
		return context.json({ error: 'Unauthorized' }, 401);
	}
	await next();
};
