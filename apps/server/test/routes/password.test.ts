import { eq, sql } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { password_reset_tokens, refreshTokens, users } from '../../src/database/schemas/schema';
import { verifyPassword } from '../../src/lib/password';
import { createUserFixture, uniqueValue } from '../fixtures/factories';
import { loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { extractTokenFromLink, type MailpitMessageDetail, waitForEmail } from '../helpers/mailpit';
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

function cookieValue(cookieHeader: string, name: string): string {
	const value = cookieHeader
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name}=`))
		?.slice(name.length + 1);
	if (!value) {
		throw new Error(`Missing ${name} fixture cookie`);
	}
	return value;
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
	const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
	if (!response.ok) {
		throw new Error(`Mailpit search failed with ${response.status}`);
	}
	return ((await response.json()) as MailpitSearch).messages;
}

async function waitForMessages(recipient: string, count: number): Promise<MailpitSearch['messages']> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const messages = await messagesFor(recipient);
		if (messages.length >= count) {
			return messages;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Expected ${count} Mailpit messages for ${recipient}`);
}

async function waitForDatabaseLockWaiters(count: number): Promise<void> {
	const deadline = Date.now() + 5_000;
	const { client } = getTestDatabase();
	while (Date.now() < deadline) {
		const result = await client.query<{ waiting: number }>(`
			SELECT count(*)::integer AS waiting
			FROM pg_stat_activity
			WHERE datname = current_database()
				AND wait_event_type = 'Lock'
		`);
		if ((result.rows[0]?.waiting ?? 0) >= count) {
			return;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Expected ${count} PostgreSQL lock waiters`);
}

async function messageDetail(messageId: string): Promise<MailpitMessageDetail> {
	const response = await fetch(mailpitApiUrl(`/api/v1/message/${encodeURIComponent(messageId)}`), {
		signal: AbortSignal.timeout(1_000),
	});
	if (!response.ok) {
		throw new Error(`Mailpit message lookup failed with ${response.status}`);
	}
	return (await response.json()) as MailpitMessageDetail;
}

function resetLinkFromEmail(email: MailpitMessageDetail): URL {
	const href = email.HTML.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
	if (!href) {
		throw new Error('Password reset email does not contain a link');
	}
	return new URL(href);
}

async function requestResetEmail(email: string, requestUrl = '/password/forgot-password'): Promise<Response> {
	return app.request(requestUrl, jsonRequest('POST', { email }));
}

async function emailedResetToken(email: string): Promise<string> {
	const response = await requestResetEmail(email);
	expect(response.status).toBe(200);
	const emailMessage = await waitForEmail(email, 'Password Reset');
	return extractTokenFromLink(`${emailMessage.HTML} ${emailMessage.Text}`, 'token');
}

async function insertResetToken(userId: number, options: { expiresAt?: Date; claims?: Record<string, unknown> } = {}) {
	const token = await sign(
		{
			id: userId,
			email: `reset-${userId}@tantovale.test`,
			exp: Math.floor(Date.now() / 1_000) + 15 * 60,
			jti: uniqueValue('reset-token'),
			...options.claims,
		},
		resetSecret(),
	);
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
		const known = await requestResetEmail(fixture.user.email, 'https://attacker.example/password/forgot-password');
		const delivered = await waitForEmail(fixture.user.email, 'Password Reset');
		const resetLink = resetLinkFromEmail(delivered);

		expect(unknown.status).toBe(200);
		expect(known.status).toBe(200);
		expect(await unknown.json()).toEqual(FORGOT_RESPONSE);
		expect(await known.json()).toEqual(FORGOT_RESPONSE);
		expect(await messagesFor(unknownEmail)).toHaveLength(0);
		expect(resetLink.origin).toBe('http://storefront.test');
		expect(resetLink.pathname).toBe('/password/reset-password');
		expect(resetLink.searchParams.get('token')).toEqual(expect.any(String));
		expect(await messagesFor(fixture.user.email)).toHaveLength(1);
	});

	it('serializes concurrent issuance so only the latest emailed token remains valid', async () => {
		const fixture = await createUserFixture();
		expect((await requestResetEmail(fixture.user.email)).status).toBe(200);
		const { client, db } = getTestDatabase();
		const blocker = await client.connect();
		let released = false;
		let responses: Response[];

		try {
			await blocker.query('BEGIN');
			await blocker.query('SELECT id FROM password_reset_tokens WHERE user_id = $1 FOR UPDATE', [fixture.user.id]);
			const pendingResponses = Promise.all([
				requestResetEmail(fixture.user.email),
				requestResetEmail(fixture.user.email),
			]);
			await waitForDatabaseLockWaiters(2);
			await blocker.query('COMMIT');
			released = true;
			responses = await pendingResponses;
		} finally {
			if (!released) {
				await blocker.query('ROLLBACK');
			}
			blocker.release();
		}

		const messages = await waitForMessages(fixture.user.email, 3);
		const details = await Promise.all(messages.map(({ ID }) => messageDetail(ID)));
		const emailedTokens = details.map((detail) => extractTokenFromLink(`${detail.HTML} ${detail.Text}`, 'token'));
		const current = await db
			.select()
			.from(password_reset_tokens)
			.where(eq(password_reset_tokens.user_id, fixture.user.id));

		expect(responses.map(({ status }) => status)).toEqual([200, 200]);
		expect(new Set(emailedTokens).size).toBe(3);
		expect(current).toHaveLength(1);
		expect(emailedTokens).toContain(current[0]!.token);

		const verificationStatuses = await Promise.all(
			emailedTokens.map(async (token) => {
				const response = await app.request(`/password/auth/reset-verify-token?token=${encodeURIComponent(token)}`);
				return response.status;
			}),
		);
		expect(verificationStatuses.sort()).toEqual([200, 400, 400]);
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

	it('rejects absent and malformed verification tokens', async () => {
		const responses = [
			await app.request('/password/auth/reset-verify-token'),
			await app.request('/password/auth/reset-verify-token?token=malformed'),
		];

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
	});

	it('rejects a validly signed token after its stored row is deleted', async () => {
		const fixture = await createUserFixture();
		const deleted = await insertResetToken(fixture.user.id);
		const { db } = getTestDatabase();
		await db.delete(password_reset_tokens).where(eq(password_reset_tokens.token, deleted));

		const response = await app.request(`/password/auth/reset-verify-token?token=${encodeURIComponent(deleted)}`);
		expect(response.status).toBe(400);
	});

	it('rejects a validly signed token whose stored row is expired', async () => {
		const fixture = await createUserFixture();
		const expired = await insertResetToken(fixture.user.id, { expiresAt: new Date(Date.now() - 60_000) });

		const response = await app.request(`/password/auth/reset-verify-token?token=${encodeURIComponent(expired)}`);
		expect(response.status).toBe(400);
	});

	it('rejects reset JWTs with unsafe identity, missing metadata, stale expiry, or a different user', async () => {
		const fixture = await createUserFixture();
		const invalidClaimSets: Array<Record<string, unknown>> = [
			{ id: '1' },
			{ id: 1.5 },
			{ email: '' },
			{ email: undefined },
			{ exp: Math.floor(Date.now() / 1_000) - 60 },
			{ exp: 'future' },
			{ jti: '' },
			{ jti: undefined },
			{ id: fixture.user.id + 1 },
		];

		for (const claims of invalidClaimSets) {
			const token = await insertResetToken(fixture.user.id, { claims });
			const response = await app.request(`/password/auth/reset-verify-token?token=${encodeURIComponent(token)}`);
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

	it('rejects passwords exceeding 72 UTF-8 bytes without mutation', async () => {
		const fixture = await createUserFixture();
		const token = await insertResetToken(fixture.user.id);
		const invalidPasswords = ['a'.repeat(73), 'é'.repeat(37)];

		for (const newPassword of invalidPasswords) {
			const response = await app.request('/password/auth/reset', jsonRequest('POST', { token, newPassword }));
			expect(response.status).toBe(400);
		}

		const { db } = getTestDatabase();
		const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));
		const rows = await db.select().from(password_reset_tokens).where(eq(password_reset_tokens.token, token));
		expect(storedUser?.password).toBe(fixture.user.password);
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

	it('rolls back token consumption and returns a redacted 500 when password persistence fails', async () => {
		const fixture = await createUserFixture();
		const token = await insertResetToken(fixture.user.id);
		const bcryptHashPattern = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
		if (!bcryptHashPattern.test(fixture.user.password)) {
			throw new Error('Fixture password is not a safe bcrypt hash');
		}
		const { db } = getTestDatabase();
		await db.execute(
			sql.raw(
				`ALTER TABLE users ADD CONSTRAINT password_reset_test_unchanged CHECK (password = '${fixture.user.password}') NOT VALID`,
			),
		);

		try {
			const response = await app.request(
				'/password/auth/reset',
				jsonRequest('POST', { token, newPassword: 'DifferentStrongPass456!' }),
			);
			const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));
			const rows = await db.select().from(password_reset_tokens).where(eq(password_reset_tokens.token, token));

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'Unable to reset password' });
			expect(storedUser?.password).toBe(fixture.user.password);
			expect(rows).toHaveLength(1);
		} finally {
			await db.execute(sql`ALTER TABLE users DROP CONSTRAINT password_reset_test_unchanged`);
		}
	});

	it('revokes all existing sessions so old cookies cannot authenticate after reset', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const originalCookies = jar.header();
		const token = await emailedResetToken(fixture.user.email);

		const reset = await app.request(
			'/password/auth/reset',
			jsonRequest('POST', { token, newPassword: 'SessionRevokingPass456!' }),
		);
		const userResponse = await app.request('/user/auth', { headers: { cookie: originalCookies } });
		const verifyResponse = await app.request('/verify', { headers: { cookie: originalCookies } });
		const { db } = getTestDatabase();

		expect(reset.status).toBe(200);
		expect(userResponse.status).toBe(401);
		expect(verifyResponse.status).toBe(401);
		expect(await db.select().from(refreshTokens)).toEqual([]);
	});

	it('serializes an old-password login behind reset so no stale session survives', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const token = await emailedResetToken(fixture.user.email);
		const newPassword = 'RaceSafeLoginPass456!';
		const { client, db } = getTestDatabase();
		const blocker = await client.connect();
		let released = false;
		let resetResponse: Response;
		let loginResponse: Response;

		try {
			await blocker.query('BEGIN');
			await blocker.query('LOCK TABLE refresh_tokens IN ACCESS EXCLUSIVE MODE');
			const pendingReset = app.request('/password/auth/reset', jsonRequest('POST', { token, newPassword }));
			await waitForDatabaseLockWaiters(1);
			const pendingLogin = app.request(
				'/login',
				jsonRequest('POST', { email: fixture.user.email, password: fixture.password }),
			);
			await waitForDatabaseLockWaiters(2);
			await blocker.query('COMMIT');
			released = true;
			[resetResponse, loginResponse] = await Promise.all([pendingReset, pendingLogin]);
		} finally {
			if (!released) {
				await blocker.query('ROLLBACK');
			}
			blocker.release();
		}

		const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(resetResponse.status).toBe(200);
		expect(loginResponse.status).toBe(401);
		expect(await verifyPassword(storedUser!.password, newPassword)).toBe(true);
		expect(sessions).toEqual([]);
	});

	it('serializes refresh rotation before reset so its replacement session is revoked', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const originalCookies = jar.header();
		const refreshToken = cookieValue(originalCookies, 'refresh_token');
		const token = await emailedResetToken(fixture.user.email);
		const newPassword = 'RaceSafeRefreshPass456!';
		const { client, db } = getTestDatabase();
		const blocker = await client.connect();
		let released = false;
		let refreshResponse: Response;
		let resetResponse: Response;

		try {
			await blocker.query('BEGIN');
			await blocker.query('SELECT id FROM refresh_tokens WHERE token = $1 FOR UPDATE', [refreshToken]);
			const pendingRefresh = app.request('/refresh/auth', {
				method: 'POST',
				headers: { cookie: originalCookies },
			});
			await waitForDatabaseLockWaiters(1);
			const pendingReset = app.request('/password/auth/reset', jsonRequest('POST', { token, newPassword }));
			await waitForDatabaseLockWaiters(2);
			await blocker.query('COMMIT');
			released = true;
			[refreshResponse, resetResponse] = await Promise.all([pendingRefresh, pendingReset]);
		} finally {
			if (!released) {
				await blocker.query('ROLLBACK');
			}
			blocker.release();
		}

		const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(refreshResponse.status).toBe(200);
		expect(resetResponse.status).toBe(200);
		expect(await verifyPassword(storedUser!.password, newPassword)).toBe(true);
		expect(sessions).toEqual([]);
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
