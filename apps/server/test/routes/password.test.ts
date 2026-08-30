import { eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { password_reset_tokens, users } from '../../src/database/schemas/schema';
import { verifyPassword } from '../../src/lib/password';
import { createUserFixture, uniqueValue } from '../fixtures/factories';
import { getTestDatabase } from '../helpers/database';
import { extractTokenFromLink, waitForEmail } from '../helpers/mailpit';
import { jsonRequest } from '../helpers/request';

/* eslint-disable turbo/no-undeclared-env-vars -- The isolated Vitest harness supplies local secrets and services. */
type MailpitSearch = {
	messages: Array<{ ID: string }>;
};

const FORGOT_RESPONSE = { message: 'If the email exists, a reset link was sent.' };

function resetSecret(): string {
	const secret = process.env.RESET_TOKEN_SECRET;
	if (!secret) {
		throw new Error('Missing test secret: RESET_TOKEN_SECRET');
	}
	return secret;
}

function mailpitApiUrl(path: string): URL {
	const value = process.env.MAILPIT_API_URL;
	if (!value) {
		throw new Error('Missing local Mailpit API URL');
	}

	const base = new URL(value);
	if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(base.hostname)) {
		throw new Error('Unsafe Mailpit API URL');
	}
	return new URL(path, base);
}

async function messagesFor(recipient: string): Promise<MailpitSearch['messages']> {
	const url = mailpitApiUrl('/api/v1/search');
	url.searchParams.set('query', `to:${recipient}`);
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Mailpit search failed with ${response.status}`);
	}
	return ((await response.json()) as MailpitSearch).messages;
}

async function requestResetEmail(email: string): Promise<Response> {
	return app.request('/password/forgot-password', jsonRequest('POST', { email }));
}

async function emailedResetToken(email: string): Promise<string> {
	const response = await requestResetEmail(email);
	expect(response.status).toBe(200);
	const emailMessage = await waitForEmail(email, 'Password Reset');
	return extractTokenFromLink(`${emailMessage.HTML} ${emailMessage.Text}`, 'token');
}

async function insertResetToken(userId: number, options: { expiresAt?: Date; payloadId?: number } = {}) {
	const token = await sign({ id: options.payloadId ?? userId }, resetSecret());
	const { db } = getTestDatabase();
	await db.insert(password_reset_tokens).values({
		user_id: userId,
		token,
		expires_at: options.expiresAt ?? new Date(Date.now() + 15 * 60 * 1_000),
	});
	return token;
}

describe('password lifecycle routes', () => {
	it('rejects a missing or invalid forgot-password email body', async () => {
		const responses = [
			await app.request('/password/forgot-password', jsonRequest('POST')),
			await requestResetEmail('not-an-email'),
		];

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
	});

	it('returns an indistinguishable response but emails only a known account', async () => {
		const fixture = await createUserFixture();
		const unknownEmail = `${uniqueValue('unknown-reset')}@tantovale.test`;

		const unknown = await requestResetEmail(unknownEmail);
		const known = await requestResetEmail(fixture.user.email);
		const delivered = await waitForEmail(fixture.user.email, 'Password Reset');

		expect(unknown.status).toBe(200);
		expect(known.status).toBe(200);
		expect(await unknown.json()).toEqual(FORGOT_RESPONSE);
		expect(await known.json()).toEqual(FORGOT_RESPONSE);
		expect(await messagesFor(unknownEmail)).toHaveLength(0);
		expect(delivered.HTML).toContain('token=');
		expect(await messagesFor(fixture.user.email)).toHaveLength(1);
	});

	it('replaces the current reset token and invalidates the prior link', async () => {
		const fixture = await createUserFixture();
		const { db } = getTestDatabase();

		expect((await requestResetEmail(fixture.user.email)).status).toBe(200);
		const [first] = await db
			.select()
			.from(password_reset_tokens)
			.where(eq(password_reset_tokens.user_id, fixture.user.id));
		expect(first).toBeDefined();

		expect((await requestResetEmail(fixture.user.email)).status).toBe(200);
		const current = await db
			.select()
			.from(password_reset_tokens)
			.where(eq(password_reset_tokens.user_id, fixture.user.id));

		expect(current).toHaveLength(1);
		expect(current[0]?.token).not.toBe(first?.token);
		expect(
			(await app.request(`/password/auth/reset-verify-token?token=${encodeURIComponent(first!.token)}`)).status,
		).toBe(400);
		expect(
			(await app.request(`/password/auth/reset-verify-token?token=${encodeURIComponent(current[0]!.token)}`)).status,
		).toBe(200);
	});

	it('verifies a stored unexpired token without authentication cookies', async () => {
		const fixture = await createUserFixture();
		const token = await insertResetToken(fixture.user.id);

		const response = await app.request(`/password/auth/reset-verify-token?token=${encodeURIComponent(token)}`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ valid: true, id: fixture.user.id });
	});

	it('rejects absent, malformed, deleted, expired, and user-mismatched verification tokens', async () => {
		const fixture = await createUserFixture();
		const deleted = await insertResetToken(fixture.user.id);
		const expired = await insertResetToken(fixture.user.id, { expiresAt: new Date(Date.now() - 60_000) });
		const mismatched = await insertResetToken(fixture.user.id, { payloadId: fixture.user.id + 1 });
		const { db } = getTestDatabase();
		await db.delete(password_reset_tokens).where(eq(password_reset_tokens.token, deleted));

		const tokens: Array<string | undefined> = [undefined, 'malformed', deleted, expired, mismatched];
		for (const token of tokens) {
			const query = token === undefined ? '' : `?token=${encodeURIComponent(token)}`;
			const response = await app.request(`/password/auth/reset-verify-token${query}`);
			expect(response.status).toBe(400);
		}
	});

	it('rejects a missing or weak new password without mutating the user or token', async () => {
		const fixture = await createUserFixture();
		const token = await insertResetToken(fixture.user.id);
		const originalHash = fixture.user.password;

		const responses = [
			await app.request('/password/auth/reset', jsonRequest('POST', { token })),
			await app.request('/password/auth/reset', jsonRequest('POST', { token, newPassword: 'short' })),
		];

		for (const response of responses) {
			expect(response.status).toBe(400);
		}

		const { db } = getTestDatabase();
		const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));
		const rows = await db.select().from(password_reset_tokens).where(eq(password_reset_tokens.token, token));
		expect(storedUser?.password).toBe(originalHash);
		expect(rows).toHaveLength(1);
	});

	it('resets from the emailed token, consumes it, and rejects reuse', async () => {
		const fixture = await createUserFixture();
		const token = await emailedResetToken(fixture.user.email);
		const newPassword = 'NewStrongPass456!';

		const response = await app.request('/password/auth/reset', jsonRequest('POST', { token, newPassword }));
		const reused = await app.request(
			'/password/auth/reset',
			jsonRequest('POST', { token, newPassword: 'AnotherStrongPass789!' }),
		);
		const { db } = getTestDatabase();
		const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));
		const rows = await db.select().from(password_reset_tokens).where(eq(password_reset_tokens.token, token));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ message: 'Password updated successfully!' });
		expect(storedUser?.password).not.toBe(fixture.user.password);
		expect(await verifyPassword(storedUser!.password, newPassword)).toBe(true);
		expect(rows).toEqual([]);
		expect(reused.status).toBe(400);
	});

	it('authenticates only the new password after a successful emailed reset', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const token = await emailedResetToken(fixture.user.email);
		const newPassword = 'ReplacementPass456!';

		const reset = await app.request('/password/auth/reset', jsonRequest('POST', { token, newPassword }));
		const oldLogin = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: fixture.password }),
		);
		const newLogin = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: newPassword }),
		);

		expect(reset.status).toBe(200);
		expect(oldLogin.status).toBe(401);
		expect(newLogin.status).toBe(200);
	});
});
