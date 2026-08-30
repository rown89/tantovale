import { eq, sql } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import { describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import { profiles, refreshTokens, users } from '../../src/database/schemas/schema';
import { verifyPassword } from '../../src/lib/password';
import { createUserFixture, uniqueValue } from '../fixtures/factories';
import { authenticatedRequest, loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { extractTokenFromLink, waitForEmail } from '../helpers/mailpit';
import { CookieJar, jsonRequest } from '../helpers/request';

function requiredSecret(name: 'ACCESS_TOKEN_SECRET' | 'EMAIL_VERIFY_TOKEN_SECRET' | 'REFRESH_TOKEN_SECRET'): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing test secret: ${name}`);
	}
	return value;
}

function signupBody(suffix: string) {
	return {
		username: `signup-${suffix}`,
		email: `signup-${suffix}@tantovale.test`,
		password: 'StrongPass123!',
		name: 'Mario',
		surname: 'Rossi',
		gender: 'male' as const,
		privacy_policy: true as const,
		marketing_policy: false,
	};
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
	return cookieHeader
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

function responseCookie(response: Response, name: string): string | undefined {
	for (const header of response.headers.getSetCookie()) {
		const value = cookieValue(header, name);
		if (value !== undefined) {
			return value;
		}
	}
	return undefined;
}

async function signupUnverified(label: string) {
	const body = signupBody(uniqueValue(label));
	const response = await app.request('/signup', jsonRequest('POST', body));
	const email = await waitForEmail(body.email, 'Attivazione account');
	const token = extractTokenFromLink(`${email.HTML} ${email.Text}`, 'token');
	const { db } = getTestDatabase();
	const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);

	if (!user) {
		throw new Error('Signup did not persist the expected user');
	}

	return { body, response, token, user };
}

async function refreshSession(jar: CookieJar): Promise<Response> {
	return authenticatedRequest('/refresh/auth', 'POST', jar);
}

describe('authentication routes', () => {
	it('POST /signup creates one user/profile, hashes the password, sets activation cookie, and emails its token', async () => {
		const { body, response, token, user } = await signupUnverified('v');
		const { db } = getTestDatabase();
		const storedUsers = await db.select().from(users);
		const storedProfiles = await db.select().from(profiles);
		const activationCookie = responseCookie(response, 'email_activation_token');
		const activationClaims = await verify(token, requiredSecret('EMAIL_VERIFY_TOKEN_SECRET'));

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ message: 'Successful Signup' });
		expect(storedUsers).toHaveLength(1);
		expect(storedProfiles).toHaveLength(1);
		expect(storedProfiles[0]?.user_id).toBe(user.id);
		expect(user.password).not.toBe(body.password);
		expect(await verifyPassword(user.password, body.password)).toBe(true);
		expect(activationCookie).toBe(token);
		expect(activationClaims).toMatchObject({ id: user.id, username: user.username, type: 'email_verification' });
	});

	it('POST /signup rejects invalid email, privacy consent, and password without persistence', async () => {
		const invalidBodies = [
			{ ...signupBody(uniqueValue('e')), email: 'not-an-email' },
			{ ...signupBody(uniqueValue('p')), privacy_policy: false },
			{ ...signupBody(uniqueValue('w')), password: 'short' },
		];

		for (const body of invalidBodies) {
			const response = await app.request('/signup', jsonRequest('POST', body));
			expect(response.status).toBe(400);
		}

		const { db } = getTestDatabase();
		expect(await db.select().from(users)).toEqual([]);
		expect(await db.select().from(profiles)).toEqual([]);
	});

	it('POST /signup rolls back the user when profile persistence fails', async () => {
		const { db } = getTestDatabase();
		await db.execute(sql`ALTER TABLE profiles ADD CONSTRAINT profiles_auth_test_name CHECK (name <> 'RollbackProbe')`);
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		try {
			const body = { ...signupBody(uniqueValue('r')), name: 'RollbackProbe' };
			const response = await app.request('/signup', jsonRequest('POST', body));

			expect(response.status).toBe(500);
			expect(await db.select().from(users)).toEqual([]);
			expect(await db.select().from(profiles)).toEqual([]);
		} finally {
			errorLog.mockRestore();
			await db.execute(sql`ALTER TABLE profiles DROP CONSTRAINT profiles_auth_test_name`);
		}
	});

	it('POST /signup rejects an existing username without creating a second account', async () => {
		const fixture = await createUserFixture();
		const body = { ...signupBody(uniqueValue('u')), username: fixture.user.username };
		const response = await app.request('/signup', jsonRequest('POST', body));
		const { db } = getTestDatabase();

		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ message: 'Username already exists' });
		expect(await db.select().from(users)).toHaveLength(1);
		expect(await db.select().from(profiles)).toHaveLength(1);
	});

	it('POST /signup rejects an existing email without creating a second account', async () => {
		const fixture = await createUserFixture();
		const body = { ...signupBody(uniqueValue('m')), email: fixture.user.email };
		const response = await app.request('/signup', jsonRequest('POST', body));
		const { db } = getTestDatabase();

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ message: 'Email already exists' });
		expect(await db.select().from(users)).toHaveLength(1);
		expect(await db.select().from(profiles)).toHaveLength(1);
	});

	it('GET /verify returns 401 for absent and malformed access tokens', async () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const absent = await app.request('/verify');
			const malformed = await app.request('/verify', { headers: { cookie: 'access_token=malformed' } });

			expect(absent.status).toBe(401);
			expect(malformed.status).toBe(401);
		} finally {
			errorLog.mockRestore();
		}
	});

	it('GET /verify/email rejects absent, malformed, and wrong-type tokens without verifying the user', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const wrongType = await sign(
			{ id: fixture.user.id, username: fixture.user.username, type: 'password_reset' },
			requiredSecret('EMAIL_VERIFY_TOKEN_SECRET'),
		);
		const responses = [
			await app.request('/verify/email'),
			await app.request('/verify/email?token=malformed'),
			await app.request(`/verify/email?token=${encodeURIComponent(wrongType)}`),
		];

		for (const response of responses) {
			expect(response.status).toBe(400);
		}

		const { db } = getTestDatabase();
		const [user] = await db.select().from(users).where(eq(users.id, fixture.user.id));
		expect(user?.email_verified).toBe(false);
		expect(await db.select().from(refreshTokens)).toEqual([]);
	});

	it('GET /verify/email activates the emailed account with verified claims and one refresh session', async () => {
		const { token, user } = await signupUnverified('a');
		const response = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		const accessToken = responseCookie(response, 'access_token');
		const refreshToken = responseCookie(response, 'refresh_token');
		const { db } = getTestDatabase();
		const [storedUser] = await db.select().from(users).where(eq(users.id, user.id));
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, user.username));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ message: 'Email verified successfully!' });
		expect(storedUser?.email_verified).toBe(true);
		expect(accessToken).toBeDefined();
		expect(refreshToken).toBeDefined();
		expect(await verify(accessToken!, requiredSecret('ACCESS_TOKEN_SECRET'))).toMatchObject({
			id: user.id,
			email_verified: true,
		});
		expect(await verify(refreshToken!, requiredSecret('REFRESH_TOKEN_SECRET'))).toMatchObject({
			id: user.id,
			email_verified: true,
		});
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.token).toBe(refreshToken);
	});

	it('GET /verify/email is idempotent for an already verified user and does not add a refresh session', async () => {
		const { token, user } = await signupUnverified('i');
		const first = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		const second = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		const { db } = getTestDatabase();
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, user.username));

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ message: 'User already verified' });
		expect(sessions).toHaveLength(1);
	});

	it('POST /login authenticates verified credentials with cookies and one matching refresh session', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const response = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: fixture.password }),
		);
		const accessToken = responseCookie(response, 'access_token');
		const refreshToken = responseCookie(response, 'refresh_token');
		const { db } = getTestDatabase();
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			message: 'login successful',
			user: { id: fixture.user.id, profile_id: fixture.profile.id, username: fixture.user.username },
		});
		expect(accessToken).toBeDefined();
		expect(refreshToken).toBeDefined();
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.token).toBe(refreshToken);
	});

	it('POST /login returns an identical 401 body for an unknown email and a wrong password', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const unknown = await app.request(
			'/login',
			jsonRequest('POST', { email: `${uniqueValue('missing')}@tantovale.test`, password: fixture.password }),
		);
		const wrongPassword = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: 'WrongPassword123!' }),
		);
		const unknownBody = await unknown.json();
		const wrongBody = await wrongPassword.json();

		expect(unknown.status).toBe(401);
		expect(wrongPassword.status).toBe(401);
		expect(unknownBody).toEqual({ message: 'invalid email or password' });
		expect(wrongBody).toEqual(unknownBody);
	});

	it('POST /login returns 403 without cookies for a valid unverified account', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const response = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: fixture.password }),
		);
		const { db } = getTestDatabase();

		expect(response.status).toBe(403);
		expect(response.headers.getSetCookie()).toEqual([]);
		expect(await db.select().from(refreshTokens)).toEqual([]);
	});

	it('GET /user/auth returns the database identity for a valid session', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const response = await authenticatedRequest('/user/auth', 'GET', jar);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: fixture.user.id,
			profile_id: fixture.profile.id,
			username: fixture.user.username,
			email: fixture.user.email,
			email_verified: true,
			phone_verified: fixture.user.phone_verified,
		});
	});

	it('GET /user/auth returns 401 without a session', async () => {
		const response = await app.request('/user/auth');
		expect(response.status).toBe(401);
	});

	it('POST /refresh/auth rotates the exact valid session once and preserves another session', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const oldAccessToken = cookieValue(jar.header(), 'access_token');
		const oldRefreshToken = cookieValue(jar.header(), 'refresh_token');
		const siblingToken = `sibling-${uniqueValue('s')}`;
		const { db } = getTestDatabase();
		await db.insert(refreshTokens).values({
			username: fixture.user.username,
			token: siblingToken,
			expires_at: new Date(Date.now() + 60_000),
		});

		const response = await refreshSession(jar);
		const body = (await response.json()) as {
			message: string;
			access_token: string;
			refresh_token: string;
		};
		const newAccessToken = cookieValue(jar.header(), 'access_token');
		const newRefreshToken = cookieValue(jar.header(), 'refresh_token');
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(response.status).toBe(200);
		expect(body).toEqual({
			message: 'Tokens refreshed successfully',
			access_token: newAccessToken,
			refresh_token: newRefreshToken,
		});
		expect(newAccessToken).not.toBe(oldAccessToken);
		expect(newRefreshToken).not.toBe(oldRefreshToken);
		expect(sessions.map(({ token }) => token)).toEqual(expect.arrayContaining([siblingToken, newRefreshToken]));
		expect(sessions.map(({ token }) => token)).not.toContain(oldRefreshToken);
		expect(sessions).toHaveLength(2);
	});

	it('POST /refresh/auth rejects replay of the old token and leaves no row for it', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const activeJar = await loginAs(fixture);
		const oldAccessToken = cookieValue(activeJar.header(), 'access_token');
		const oldRefreshToken = cookieValue(activeJar.header(), 'refresh_token');
		const replayJar = new CookieJar();
		replayJar.capture([`access_token=${oldAccessToken}`, `refresh_token=${oldRefreshToken}`]);
		expect((await refreshSession(activeJar)).status).toBe(200);

		const replay = await refreshSession(replayJar);
		const { db } = getTestDatabase();
		const oldRows = await db.select().from(refreshTokens).where(eq(refreshTokens.token, oldRefreshToken!));

		expect(replay.status).toBe(401);
		expect(oldRows).toEqual([]);
	});

	it('POST /refresh/auth rejects and consumes an expired stored token', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const { db } = getTestDatabase();
		await db
			.update(refreshTokens)
			.set({ expires_at: new Date(Date.now() - 60_000) })
			.where(eq(refreshTokens.token, refreshToken!));

		const response = await refreshSession(jar);
		const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.token, refreshToken!));

		expect(response.status).toBe(401);
		expect(rows).toEqual([]);
	});

	it('POST /refresh/auth rolls back token consumption when replacement persistence fails', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const { db } = getTestDatabase();
		await db.execute(
			sql`ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_auth_test_reject_insert CHECK (false) NOT VALID`,
		);

		try {
			const response = await refreshSession(jar);
			const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.token, refreshToken!));

			expect(response.status).toBe(500);
			expect(rows).toHaveLength(1);
		} finally {
			await db.execute(sql`ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_auth_test_reject_insert`);
		}
	});

	it('POST /logout/auth expires both cookies and removes only the presented refresh session', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const siblingToken = `sibling-${uniqueValue('l')}`;
		const { db } = getTestDatabase();
		await db.insert(refreshTokens).values({
			username: fixture.user.username,
			token: siblingToken,
			expires_at: new Date(Date.now() + 60_000),
		});

		const response = await authenticatedRequest('/logout/auth', 'POST', jar);
		const setCookies = response.headers.getSetCookie();
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ message: 'Logout successful' });
		expect(setCookies).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^access_token=;.*Max-Age=0/i),
				expect.stringMatching(/^refresh_token=;.*Max-Age=0/i),
			]),
		);
		expect(jar.header()).toBe('');
		expect(sessions.map(({ token }) => token)).toEqual([siblingToken]);
		expect(sessions.map(({ token }) => token)).not.toContain(refreshToken);
	});

	it('POST /logout/auth returns 401 when the logged-out cookie jar is reused', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		expect((await authenticatedRequest('/logout/auth', 'POST', jar)).status).toBe(200);

		const reused = await authenticatedRequest('/logout/auth', 'POST', jar);
		expect(reused.status).toBe(401);
	});
});
