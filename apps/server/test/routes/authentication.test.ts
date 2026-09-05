import { eq, sql } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import { password_reset_tokens, profiles, refreshTokens, users } from '../../src/database/schemas/schema';
import { verifyPassword } from '../../src/lib/password';
import * as verifyEmailMailer from '../../src/mailer/templates/verify-email';
import { createUserFixture, uniqueValue } from '../fixtures/factories';
import { authenticatedRequest, loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { extractTokenFromLink, waitForEmail } from '../helpers/mailpit';
import { CookieJar, jsonRequest } from '../helpers/request';

function requiredSecret(
	name: 'ACCESS_TOKEN_SECRET' | 'EMAIL_VERIFY_TOKEN_SECRET' | 'REFRESH_TOKEN_SECRET' | 'RESET_TOKEN_SECRET',
): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing test secret: ${name}`);
	}
	return value;
}

async function emailVerificationToken(
	user: Pick<typeof users.$inferSelect, 'id' | 'username' | 'updated_at'>,
	options: { legacy?: boolean } = {},
): Promise<string> {
	return sign(
		{
			id: user.id,
			username: user.username,
			type: 'email_verification',
			exp: Math.floor(Date.now() / 1_000) + 60 * 60,
			...(options.legacy ? {} : { auth_epoch: user.updated_at.getTime() }),
		},
		requiredSecret('EMAIL_VERIFY_TOKEN_SECRET'),
	);
}

async function passwordResetToken(user: Pick<typeof users.$inferSelect, 'id' | 'email'>): Promise<string> {
	const token = await sign(
		{
			id: user.id,
			email: user.email,
			exp: Math.floor(Date.now() / 1_000) + 15 * 60,
			jti: uniqueValue('verify-reset'),
		},
		requiredSecret('RESET_TOKEN_SECRET'),
	);
	const { db } = getTestDatabase();
	await db.insert(password_reset_tokens).values({
		user_id: user.id,
		token,
		expires_at: new Date(Date.now() + 15 * 60 * 1_000),
	});
	return token;
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
	const header = responseCookieHeader(response, name);
	return header ? cookieValue(header, name) : undefined;
}

function responseCookieHeader(response: Response, name: string): string | undefined {
	return response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`));
}

function cookieMaxAge(response: Response, name: string): number | undefined {
	const match = responseCookieHeader(response, name)?.match(/(?:^|;)\s*Max-Age=(\d+)/i);
	return match?.[1] ? Number(match[1]) : undefined;
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

async function openDedicatedTestConnection(): Promise<pg.Client> {
	const { client } = getTestDatabase();
	const connection = new pg.Client(client.options);
	await connection.connect();
	return connection;
}

async function waitForBlockedStatements(
	connection: Pick<pg.Client, 'query'>,
	blockerPid: number,
	count: number,
	queryPattern = '%',
): Promise<Array<{ pid: number; query: string }>> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const { rows } = await connection.query<{ pid: number; query: string }>(
			`
			SELECT activity.pid, activity.query
			FROM pg_stat_activity AS activity
			WHERE activity.datname = current_database()
				AND activity.pid <> pg_backend_pid()
				AND activity.wait_event_type = 'Lock'
				AND (
					$1::integer = ANY(pg_blocking_pids(activity.pid))
					OR EXISTS (
						SELECT 1
						FROM unnest(pg_blocking_pids(activity.pid)) AS immediate_blocker(pid)
						WHERE $1::integer = ANY(pg_blocking_pids(immediate_blocker.pid))
					)
				)
				AND activity.query ILIKE $2
			ORDER BY activity.pid
		`,
			[blockerPid, queryPattern],
		);
		if (rows.length >= count) return rows;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	throw new Error(`Timed out waiting for ${count} statements blocked by backend ${blockerPid}`);
}

describe('authentication routes', () => {
	it('POST /signup creates one user/profile, hashes the password, sets activation cookie, and emails its token', async () => {
		const { body, response, token, user } = await signupUnverified('v');
		const { db } = getTestDatabase();
		const storedUsers = await db.select().from(users);
		const storedProfiles = await db.select().from(profiles);
		const activationCookie = responseCookie(response, 'email_activation_token');
		const activationClaims = await verify(token, requiredSecret('EMAIL_VERIFY_TOKEN_SECRET'));
		const now = Math.floor(Date.now() / 1_000);

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ message: 'Successful Signup' });
		expect(storedUsers).toHaveLength(1);
		expect(storedProfiles).toHaveLength(1);
		expect(storedProfiles[0]?.user_id).toBe(user.id);
		expect(user.password).not.toBe(body.password);
		expect(await verifyPassword(user.password, body.password)).toBe(true);
		expect(activationCookie).toBe(token);
		expect(activationClaims).toMatchObject({ id: user.id, username: user.username, type: 'email_verification' });
		expect(activationClaims.auth_epoch).toBe(user.updated_at.getTime());
		expect(activationClaims).not.toHaveProperty('expiresIn');
		expect(Number(activationClaims.exp)).toBeGreaterThanOrEqual(now + 60 * 60 - 5);
		expect(Number(activationClaims.exp)).toBeLessThanOrEqual(now + 60 * 60 + 5);
		expect(cookieMaxAge(response, 'email_activation_token')).toBe(60 * 60);
	});

	it('POST /signup never logs the email verification link or token in development', async () => {
		const initialNodeEnv = process.env.NODE_ENV;
		const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		try {
			process.env.NODE_ENV = 'development';
			const body = signupBody(uniqueValue('no-log'));
			const response = await app.request('/signup', jsonRequest('POST', body));
			const email = await waitForEmail(body.email, 'Attivazione account');

			expect(response.status).toBe(201);
			expect(email.HTML).toContain('token=');
			expect(consoleLog).not.toHaveBeenCalled();
		} finally {
			process.env.NODE_ENV = initialNodeEnv;
			consoleLog.mockRestore();
		}
	});

	it('POST /signup rejects invalid email, privacy consent, and password without persistence', async () => {
		const invalidBodies = [
			{ ...signupBody(uniqueValue('e')), email: 'not-an-email' },
			{ ...signupBody(uniqueValue('p')), privacy_policy: false },
			{ ...signupBody(uniqueValue('w')), password: 'short' },
			{ ...signupBody(uniqueValue('b')), password: 'a'.repeat(73) },
			{ ...signupBody(uniqueValue('mb')), password: 'é'.repeat(37) },
		];

		for (const body of invalidBodies) {
			const response = await app.request('/signup', jsonRequest('POST', body));
			expect(response.status).toBe(400);
		}

		const { db } = getTestDatabase();
		expect(await db.select().from(users)).toEqual([]);
		expect(await db.select().from(profiles)).toEqual([]);
	});

	it('POST /login preserves compatibility with a legacy bcrypt hash truncated at 72 bytes', async () => {
		const legacyPrefix = 'a'.repeat(72);
		const fixture = await createUserFixture({ password: legacyPrefix, emailVerified: true });

		const response = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: `${legacyPrefix}legacy` }),
		);

		expect(response.status).toBe(200);
	});

	it('POST /signup rolls back the user when profile persistence fails', async () => {
		const { db } = getTestDatabase();
		await db.execute(sql`ALTER TABLE profiles ADD CONSTRAINT profiles_auth_test_name CHECK (name <> 'RollbackProbe')`);
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		try {
			const body = { ...signupBody(uniqueValue('r')), name: 'RollbackProbe' };
			const response = await app.request('/signup', jsonRequest('POST', body));

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ message: 'Internal server error' });
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

	it('POST /signup compensates an SMTP failure so the same account can be retried', async () => {
		const body = signupBody(uniqueValue('smtp'));
		const sendEmail = vi
			.spyOn(verifyEmailMailer, 'sendVerifyEmail')
			.mockRejectedValueOnce(new Error('local SMTP failure'));
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { db } = getTestDatabase();

		try {
			const failed = await app.request('/signup', jsonRequest('POST', body));
			expect(failed.status).toBe(500);
			expect(await failed.json()).toEqual({ message: 'Internal server error' });
			expect(responseCookieHeader(failed, 'email_activation_token')).toBeUndefined();
			expect(await db.select().from(users)).toEqual([]);
			expect(await db.select().from(profiles)).toEqual([]);

			const retried = await app.request('/signup', jsonRequest('POST', body));
			expect(retried.status).toBe(201);
			await expect(waitForEmail(body.email, 'Attivazione account')).resolves.toMatchObject({
				HTML: expect.stringContaining('token='),
			});
			expect(await db.select().from(users)).toHaveLength(1);
			expect(await db.select().from(profiles)).toHaveLength(1);
		} finally {
			sendEmail.mockRestore();
			errorLog.mockRestore();
		}
	});

	it('GET /verify returns 401 without logging for absent, malformed, and signed access tokens without exp', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const noExpirationToken = await sign(
			{
				id: fixture.user.id,
				profile_id: fixture.profile.id,
				username: fixture.user.username,
				email: fixture.user.email,
				email_verified: true,
				phone_verified: false,
			},
			requiredSecret('ACCESS_TOKEN_SECRET'),
		);
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const absent = await app.request('/verify');
			const malformed = await app.request('/verify', { headers: { cookie: 'access_token=malformed' } });
			const noExpiration = await app.request('/verify', {
				headers: { cookie: `access_token=${noExpirationToken}` },
			});

			expect(absent.status).toBe(401);
			expect(malformed.status).toBe(401);
			expect(noExpiration.status).toBe(401);
			expect(errorLog).not.toHaveBeenCalled();
		} finally {
			errorLog.mockRestore();
		}
	});

	it('GET /verify resolves and returns the current database identity', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const currentEmail = `${uniqueValue('verify-current')}@tantovale.test`;
		const { db } = getTestDatabase();
		await db.update(users).set({ email: currentEmail }).where(eq(users.id, fixture.user.id));

		const response = await app.request('/verify', { headers: { cookie: jar.header() } });
		const body = (await response.json()) as { user: { email: string; username: string } };

		expect(response.status).toBe(200);
		expect(body.user).toMatchObject({ email: currentEmail, username: fixture.user.username });
	});

	it('GET /verify rejects an otherwise valid access token after the account is banned', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const { db } = getTestDatabase();
		await db.update(users).set({ is_banned: true }).where(eq(users.id, fixture.user.id));

		const response = await app.request('/verify', { headers: { cookie: jar.header() } });

		expect(response.status).toBe(401);
	});

	it('GET /verify/email rejects absent, malformed, wrong-type, and expired tokens without verifying the user', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const wrongType = await sign(
			{ id: fixture.user.id, username: fixture.user.username, type: 'password_reset' },
			requiredSecret('EMAIL_VERIFY_TOKEN_SECRET'),
		);
		const expired = await sign(
			{
				id: fixture.user.id,
				username: fixture.user.username,
				type: 'email_verification',
				exp: Math.floor(Date.now() / 1_000) - 60,
			},
			requiredSecret('EMAIL_VERIFY_TOKEN_SECRET'),
		);
		const noExpiration = await sign(
			{
				id: fixture.user.id,
				username: fixture.user.username,
				type: 'email_verification',
				expiresIn: Math.floor(Date.now() / 1_000) + 60 * 60,
			},
			requiredSecret('EMAIL_VERIFY_TOKEN_SECRET'),
		);
		const responses = [
			await app.request('/verify/email'),
			await app.request('/verify/email?token=malformed'),
			await app.request(`/verify/email?token=${encodeURIComponent(wrongType)}`),
			await app.request(`/verify/email?token=${encodeURIComponent(expired)}`),
			await app.request(`/verify/email?token=${encodeURIComponent(noExpiration)}`),
		];

		for (const response of responses) {
			expect(response.status).toBe(400);
		}

		const { db } = getTestDatabase();
		const [user] = await db.select().from(users).where(eq(users.id, fixture.user.id));
		expect(user?.email_verified).toBe(false);
		expect(await db.select().from(refreshTokens)).toEqual([]);
	});

	it('GET /verify/email only verifies the account and never creates an authenticated session', async () => {
		const { token, user } = await signupUnverified('a');
		const response = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		const activationCookie = responseCookieHeader(response, 'email_activation_token');
		const { db } = getTestDatabase();
		const [storedUser] = await db.select().from(users).where(eq(users.id, user.id));
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, user.username));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ message: 'Email verified successfully!' });
		expect(storedUser?.email_verified).toBe(true);
		expect(activationCookie).toMatch(/^email_activation_token=;.*Max-Age=0/i);
		expect(activationCookie).toContain('Path=/');
		expect(activationCookie).toContain('HttpOnly');
		expect(activationCookie).toContain('Secure');
		expect(activationCookie).toContain('SameSite=None');
		expect(activationCookie).not.toContain('Domain=');
		expect(responseCookieHeader(response, 'access_token')).toBeUndefined();
		expect(responseCookieHeader(response, 'refresh_token')).toBeUndefined();
		expect(sessions).toEqual([]);
	});

	it('GET /verify/email is idempotent for an already verified user and does not add a refresh session', async () => {
		const { token, user } = await signupUnverified('i');
		const first = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		const initialNodeEnv = process.env.NODE_ENV;
		let second: Response;

		try {
			process.env.NODE_ENV = 'production';
			second = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		} finally {
			process.env.NODE_ENV = initialNodeEnv;
		}

		const activationCookie = responseCookieHeader(second, 'email_activation_token');
		const { db } = getTestDatabase();
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, user.username));

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ message: 'User already verified' });
		expect(activationCookie).toMatch(/^email_activation_token=;.*Max-Age=0/i);
		expect(activationCookie).toContain('Domain=tantovale.it');
		expect(activationCookie).toContain('Path=/');
		expect(activationCookie).toContain('HttpOnly');
		expect(activationCookie).toContain('Secure');
		expect(activationCookie).toContain('SameSite=None');
		expect(first.headers.getSetCookie().some((cookie) => /^(?:access|refresh)_token=/i.test(cookie))).toBe(false);
		expect(second.headers.getSetCookie().some((cookie) => /^(?:access|refresh)_token=/i.test(cookie))).toBe(false);
		expect(sessions).toEqual([]);
	});

	it('serializes double email verification so both requests are idempotent without creating a session', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const token = await emailVerificationToken(fixture.user);
		const { client, db } = getTestDatabase();
		const barrier = await openDedicatedTestConnection();
		let lockHeld = false;
		let firstRequest: Promise<Response> | undefined;
		let secondRequest: Promise<Response> | undefined;

		await client.query(`
			CREATE FUNCTION test_hold_email_verify_update() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				PERFORM pg_advisory_xact_lock(hashtext(current_database()), 71011);
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER test_hold_email_verify_update
				BEFORE UPDATE ON users
				FOR EACH ROW WHEN (OLD.email_verified IS DISTINCT FROM NEW.email_verified)
				EXECUTE FUNCTION test_hold_email_verify_update();
		`);

		try {
			await barrier.query('SELECT pg_advisory_lock(hashtext(current_database()), 71011)');
			lockHeld = true;
			const blocker = await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
			const blockerPid = blocker.rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing email-verify barrier PID');

			firstRequest = Promise.resolve(app.request(`/verify/email?token=${encodeURIComponent(token)}`));
			await waitForBlockedStatements(barrier, blockerPid, 1, '%update "users"%');
			secondRequest = Promise.resolve(app.request(`/verify/email?token=${encodeURIComponent(token)}`));
			await waitForBlockedStatements(barrier, blockerPid, 2);

			await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71011)');
			lockHeld = false;
		} finally {
			if (lockHeld) await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71011)');
			await Promise.allSettled([firstRequest, secondRequest].filter((request) => request !== undefined));
			await client.query('DROP TRIGGER IF EXISTS test_hold_email_verify_update ON users');
			await client.query('DROP FUNCTION IF EXISTS test_hold_email_verify_update()');
			await barrier.end();
		}

		if (!firstRequest || !secondRequest) throw new Error('Email verification requests did not start');
		const responses = await Promise.all([firstRequest, secondRequest]);
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(responses.map(({ status }) => status)).toEqual([200, 200]);
		expect(await Promise.all(responses.map((response) => response.clone().json()))).toEqual([
			{ message: 'Email verified successfully!' },
			{ message: 'User already verified' },
		]);
		expect(responses.some((response) => responseCookie(response, 'refresh_token'))).toBe(false);
		expect(sessions).toEqual([]);
	});

	it('rejects email verification for a banned account without issuing cookies or sessions', async () => {
		const fixture = await createUserFixture({ emailVerified: false, user: { is_banned: true } });
		const token = await emailVerificationToken(fixture.user);
		const response = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		const { db } = getTestDatabase();

		expect(response.status).toBe(400);
		expect(response.headers.getSetCookie()).toEqual([]);
		expect(await db.select().from(refreshTokens)).toEqual([]);
		expect((await db.select().from(users).where(eq(users.id, fixture.user.id)))[0]?.email_verified).toBe(false);
	});

	it('rejects every legacy verification token without an auth epoch', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const token = await emailVerificationToken(fixture.user, { legacy: true });
		const response = await app.request(`/verify/email?token=${encodeURIComponent(token)}`);
		const { db } = getTestDatabase();

		expect(response.status).toBe(400);
		expect(response.headers.getSetCookie()).toEqual([]);
		expect((await db.select().from(users).where(eq(users.id, fixture.user.id)))[0]?.email_verified).toBe(false);
		expect(await db.select().from(refreshTokens)).toEqual([]);
	});

	it('uses password reset as email proof without creating a session and invalidates the old activation link', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const activationToken = await emailVerificationToken(fixture.user);
		const resetToken = await passwordResetToken(fixture.user);
		const newPassword = 'RecoveredUnverifiedPass456!';

		const reset = await app.request('/password/auth/reset', jsonRequest('POST', { token: resetToken, newPassword }));
		const staleActivation = await app.request(`/verify/email?token=${encodeURIComponent(activationToken)}`);
		const login = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: newPassword }),
		);
		const { db } = getTestDatabase();
		const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));

		expect(reset.status).toBe(200);
		expect(reset.headers.getSetCookie()).toEqual([]);
		expect(staleActivation.status).toBe(400);
		expect(storedUser?.email_verified).toBe(true);
		expect(login.status).toBe(200);
	});

	it('does not replace an existing browser session when verifying another account', async () => {
		const signedIn = await createUserFixture({ emailVerified: true });
		const existingJar = await loginAs(signedIn);
		const unverified = await createUserFixture({ emailVerified: false });
		const token = await emailVerificationToken(unverified.user);

		const activation = await app.request(`/verify/email?token=${encodeURIComponent(token)}`, {
			headers: { cookie: existingJar.header() },
		});
		const currentSession = await app.request('/user/auth', { headers: { cookie: existingJar.header() } });

		expect(activation.status).toBe(200);
		expect(activation.headers.getSetCookie().some((cookie) => /^(?:access|refresh)_token=/i.test(cookie))).toBe(false);
		expect(currentSession.status).toBe(200);
		expect(await currentSession.json()).toMatchObject({ id: signedIn.user.id, profile_id: signedIn.profile.id });
	});

	it('lets verify commit first and then lets reset advance the epoch without creating a session', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const verifyToken = await emailVerificationToken(fixture.user);
		const resetToken = await passwordResetToken(fixture.user);
		const { client, db } = getTestDatabase();
		const barrier = await openDedicatedTestConnection();
		let lockHeld = false;
		let pendingVerify: Promise<Response> | undefined;
		let pendingReset: Promise<Response> | undefined;

		await client.query(`
			CREATE FUNCTION test_hold_verify_before_reset() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				PERFORM pg_advisory_xact_lock(hashtext(current_database()), 71012);
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER test_hold_verify_before_reset
				BEFORE UPDATE ON users
				FOR EACH ROW WHEN (OLD.email_verified IS DISTINCT FROM NEW.email_verified)
				EXECUTE FUNCTION test_hold_verify_before_reset();
		`);

		try {
			await barrier.query('SELECT pg_advisory_lock(hashtext(current_database()), 71012)');
			lockHeld = true;
			const blocker = await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
			const blockerPid = blocker.rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing verify-first barrier PID');

			pendingVerify = Promise.resolve(app.request(`/verify/email?token=${encodeURIComponent(verifyToken)}`));
			await waitForBlockedStatements(barrier, blockerPid, 1, '%update "users"%');
			pendingReset = Promise.resolve(
				app.request(
					'/password/auth/reset',
					jsonRequest('POST', { token: resetToken, newPassword: 'VerifyFirstResetPass456!' }),
				),
			);
			await waitForBlockedStatements(barrier, blockerPid, 2);

			await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71012)');
			lockHeld = false;
		} finally {
			if (lockHeld) await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71012)');
			await Promise.allSettled([pendingVerify, pendingReset].filter((request) => request !== undefined));
			await client.query('DROP TRIGGER IF EXISTS test_hold_verify_before_reset ON users');
			await client.query('DROP FUNCTION IF EXISTS test_hold_verify_before_reset()');
			await barrier.end();
		}

		if (!pendingVerify || !pendingReset) throw new Error('Verify/reset requests did not start');
		const [verifyResponse, resetResponse] = await Promise.all([pendingVerify, pendingReset]);
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(verifyResponse.status).toBe(200);
		expect(resetResponse.status).toBe(200);
		expect(sessions).toEqual([]);
		expect(verifyResponse.headers.getSetCookie().some((cookie) => /^(?:access|refresh)_token=/i.test(cookie))).toBe(
			false,
		);
	});

	it('lets reset commit first so the stale verification epoch cannot issue a session', async () => {
		const fixture = await createUserFixture({ emailVerified: false });
		const verifyToken = await emailVerificationToken(fixture.user);
		const resetToken = await passwordResetToken(fixture.user);
		const { client, db } = getTestDatabase();
		const barrier = await openDedicatedTestConnection();
		let lockHeld = false;
		let pendingReset: Promise<Response> | undefined;
		let pendingVerify: Promise<Response> | undefined;

		await client.query(`
			CREATE FUNCTION test_hold_reset_before_verify() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				PERFORM pg_advisory_xact_lock(hashtext(current_database()), 71013);
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER test_hold_reset_before_verify
				BEFORE UPDATE ON users
				FOR EACH ROW WHEN (OLD.password IS DISTINCT FROM NEW.password)
				EXECUTE FUNCTION test_hold_reset_before_verify();
		`);

		try {
			await barrier.query('SELECT pg_advisory_lock(hashtext(current_database()), 71013)');
			lockHeld = true;
			const blocker = await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
			const blockerPid = blocker.rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing reset-first barrier PID');

			pendingReset = Promise.resolve(
				app.request(
					'/password/auth/reset',
					jsonRequest('POST', { token: resetToken, newPassword: 'ResetFirstVerifyPass456!' }),
				),
			);
			await waitForBlockedStatements(barrier, blockerPid, 1, '%update "users"%');
			pendingVerify = Promise.resolve(app.request(`/verify/email?token=${encodeURIComponent(verifyToken)}`));
			await waitForBlockedStatements(barrier, blockerPid, 2);

			await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71013)');
			lockHeld = false;
		} finally {
			if (lockHeld) await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71013)');
			await Promise.allSettled([pendingReset, pendingVerify].filter((request) => request !== undefined));
			await client.query('DROP TRIGGER IF EXISTS test_hold_reset_before_verify ON users');
			await client.query('DROP FUNCTION IF EXISTS test_hold_reset_before_verify()');
			await barrier.end();
		}

		if (!pendingReset || !pendingVerify) throw new Error('Reset/verify requests did not start');
		const [resetResponse, verifyResponse] = await Promise.all([pendingReset, pendingVerify]);
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));
		const [storedUser] = await db.select().from(users).where(eq(users.id, fixture.user.id));

		expect(resetResponse.status).toBe(200);
		expect(verifyResponse.status).toBe(400);
		expect(verifyResponse.headers.getSetCookie()).toEqual([]);
		expect(storedUser?.email_verified).toBe(true);
		expect(storedUser?.updated_at.getTime()).toBeGreaterThan(fixture.user.updated_at.getTime());
		expect(sessions).toEqual([]);
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
		const accessClaims = await verify(accessToken!, requiredSecret('ACCESS_TOKEN_SECRET'));
		const refreshClaims = await verify(refreshToken!, requiredSecret('REFRESH_TOKEN_SECRET'));
		const now = Math.floor(Date.now() / 1_000);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			message: 'login successful',
			user: { id: fixture.user.id, profile_id: fixture.profile.id, username: fixture.user.username },
		});
		expect(accessToken).toBeDefined();
		expect(refreshToken).toBeDefined();
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.token).toBe(refreshToken);
		expect(accessClaims.jti).toEqual(expect.any(String));
		expect(refreshClaims.jti).toEqual(expect.any(String));
		expect(refreshClaims.sid).toEqual(expect.any(String));
		expect(Number(accessClaims.exp)).toBeGreaterThanOrEqual(now + 24 * 60 * 60 - 5);
		expect(Number(refreshClaims.exp)).toBeGreaterThanOrEqual(now + 7 * 24 * 60 * 60 - 5);
		expect(cookieMaxAge(response, 'access_token')).toBe(24 * 60 * 60);
		expect(cookieMaxAge(response, 'refresh_token')).toBe(7 * 24 * 60 * 60);
		expect(sessions[0]?.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1_000);
		expect(sessions[0]?.expires_at.getTime()).toBeGreaterThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1_000 - 5_000);
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

	it('POST /login rejects a banned account without cookies or a refresh session', async () => {
		const fixture = await createUserFixture({ emailVerified: true, user: { is_banned: true } });
		const response = await app.request(
			'/login',
			jsonRequest('POST', { email: fixture.user.email, password: fixture.password }),
		);
		const { db } = getTestDatabase();

		expect(response.status).toBe(403);
		expect(response.headers.getSetCookie()).toEqual([]);
		expect(await db.select().from(refreshTokens)).toEqual([]);
	});

	it('POST /login does not issue cookies or log credentials when refresh persistence fails', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const { db } = getTestDatabase();
		await db.execute(
			sql`ALTER TABLE refresh_tokens ADD CONSTRAINT login_auth_test_reject_insert CHECK (false) NOT VALID`,
		);
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		try {
			const response = await app.request(
				'/login',
				jsonRequest('POST', { email: fixture.user.email, password: fixture.password }),
			);

			expect(response.status).toBe(500);
			expect(response.headers.getSetCookie()).toEqual([]);
			expect(await db.select().from(refreshTokens)).toEqual([]);
			expect(errorLog).not.toHaveBeenCalled();
		} finally {
			errorLog.mockRestore();
			await db.execute(sql`ALTER TABLE refresh_tokens DROP CONSTRAINT login_auth_test_reject_insert`);
		}
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

	it('GET /user/auth invalidates an existing session after the account is banned', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const { db } = getTestDatabase();
		await db.update(users).set({ is_banned: true }).where(eq(users.id, fixture.user.id));

		const response = await authenticatedRequest('/user/auth', 'GET', jar);
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.token, refreshToken!));

		expect(response.status).toBe(401);
		expect(jar.header()).toBe('');
		expect(sessions).toEqual([]);
	});

	it('GET /user/auth cannot mint access from an expired signed refresh JWT with a live database row', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const expiredRefreshToken = await sign(
			{
				id: fixture.user.id,
				profile_id: fixture.profile.id,
				username: fixture.user.username,
				email: fixture.user.email,
				email_verified: true,
				phone_verified: false,
				exp: Math.floor(Date.now() / 1_000) - 60,
				jti: uniqueValue('expired'),
			},
			requiredSecret('REFRESH_TOKEN_SECRET'),
		);
		const { db } = getTestDatabase();
		await db.insert(refreshTokens).values({
			username: fixture.user.username,
			token: expiredRefreshToken,
			expires_at: new Date(Date.now() + 60_000),
		});
		const jar = new CookieJar();
		jar.capture([`access_token=unusable`, `refresh_token=${expiredRefreshToken}`]);

		const response = await authenticatedRequest('/user/auth', 'GET', jar);
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.token, expiredRefreshToken));

		expect(response.status).toBe(401);
		expect(jar.header()).toBe('');
		expect(sessions).toEqual([]);
	});

	it('GET /user/auth cannot mint access when refresh claims do not match the stored session owner', async () => {
		const tokenOwner = await createUserFixture({ emailVerified: true });
		const storedOwner = await createUserFixture({ emailVerified: true });
		const mismatchedRefreshToken = await sign(
			{
				id: tokenOwner.user.id,
				profile_id: tokenOwner.profile.id,
				username: tokenOwner.user.username,
				email: tokenOwner.user.email,
				email_verified: true,
				phone_verified: false,
				exp: Math.floor(Date.now() / 1_000) + 60 * 60,
				jti: uniqueValue('mismatch'),
			},
			requiredSecret('REFRESH_TOKEN_SECRET'),
		);
		const { db } = getTestDatabase();
		await db.insert(refreshTokens).values({
			username: storedOwner.user.username,
			token: mismatchedRefreshToken,
			expires_at: new Date(Date.now() + 60_000),
		});
		const jar = new CookieJar();
		jar.capture([`access_token=unusable`, `refresh_token=${mismatchedRefreshToken}`]);

		const response = await authenticatedRequest('/user/auth', 'GET', jar);
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.token, mismatchedRefreshToken));

		expect(response.status).toBe(401);
		expect(jar.header()).toBe('');
		expect(sessions).toEqual([]);
	});

	it('GET /user/auth permits exactly one concurrent automatic rotation for an unusable access token', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const originalJar = await loginAs(fixture);
		const refreshToken = cookieValue(originalJar.header(), 'refresh_token');
		const firstJar = new CookieJar();
		const secondJar = new CookieJar();
		firstJar.capture([`access_token=unusable`, `refresh_token=${refreshToken}`]);
		secondJar.capture([`access_token=unusable`, `refresh_token=${refreshToken}`]);

		const responses = await Promise.all([
			authenticatedRequest('/user/auth', 'GET', firstJar),
			authenticatedRequest('/user/auth', 'GET', secondJar),
		]);
		const winner = responses.find(({ status }) => status === 200);
		const loser = responses.find(({ status }) => status === 401);
		const { db } = getTestDatabase();
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
		expect(responseCookie(winner!, 'access_token')).toEqual(expect.any(String));
		expect(responseCookie(winner!, 'refresh_token')).toEqual(expect.any(String));
		expect(responseCookie(loser!, 'access_token')).toBe('');
		expect(responseCookie(loser!, 'refresh_token')).toBe('');
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.token).not.toBe(refreshToken);
	});

	it('GET /user/auth preserves the original session when automatic rotation persistence fails', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const { db } = getTestDatabase();
		await db.execute(
			sql`ALTER TABLE refresh_tokens ADD CONSTRAINT middleware_auth_test_reject_insert CHECK (false) NOT VALID`,
		);

		try {
			const response = await app.request('/user/auth', {
				headers: { cookie: `access_token=unusable; refresh_token=${refreshToken}` },
			});
			const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.token, refreshToken!));

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ message: 'Authentication failed' });
			expect(response.headers.getSetCookie()).toEqual([]);
			expect(rows).toHaveLength(1);
		} finally {
			await db.execute(sql`ALTER TABLE refresh_tokens DROP CONSTRAINT middleware_auth_test_reject_insert`);
		}
	});

	it('POST /refresh/auth rotates the exact valid session without exposing credentials and preserves another real session', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const [jar, siblingJar] = await Promise.all([loginAs(fixture), loginAs(fixture)]);
		const oldAccessToken = cookieValue(jar.header(), 'access_token');
		const oldRefreshToken = cookieValue(jar.header(), 'refresh_token');
		const siblingToken = cookieValue(siblingJar.header(), 'refresh_token');
		const { db } = getTestDatabase();

		const oldRefreshClaims = await verify(oldRefreshToken!, requiredSecret('REFRESH_TOKEN_SECRET'));
		const response = await refreshSession(jar);
		const body = await response.json();
		const newAccessToken = cookieValue(jar.header(), 'access_token');
		const newRefreshToken = cookieValue(jar.header(), 'refresh_token');
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(response.status).toBe(200);
		expect(body).toEqual({ message: 'Tokens refreshed successfully' });
		expect(body).not.toHaveProperty('access_token');
		expect(body).not.toHaveProperty('refresh_token');
		expect(newAccessToken).not.toBe(oldAccessToken);
		expect(newRefreshToken).not.toBe(oldRefreshToken);
		expect(await verify(newRefreshToken!, requiredSecret('REFRESH_TOKEN_SECRET'))).toMatchObject({
			sid: oldRefreshClaims.sid,
		});
		expect(sessions.map(({ token }) => token)).toEqual(expect.arrayContaining([siblingToken, newRefreshToken]));
		expect(sessions.map(({ token }) => token)).not.toContain(oldRefreshToken);
		expect(sessions).toHaveLength(2);
	});

	it('POST /refresh/auth rejects malformed signed claims and deletes only that presented session', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const activeJar = await loginAs(fixture);
		const accessToken = cookieValue(activeJar.header(), 'access_token');
		const validRefreshToken = cookieValue(activeJar.header(), 'refresh_token');
		const malformedRefreshToken = await sign(
			{
				username: fixture.user.username,
				exp: Math.floor(Date.now() / 1_000) + 60 * 60,
				jti: uniqueValue('malformed'),
			},
			requiredSecret('REFRESH_TOKEN_SECRET'),
		);
		const { db } = getTestDatabase();
		await db.insert(refreshTokens).values({
			username: fixture.user.username,
			token: malformedRefreshToken,
			expires_at: new Date(Date.now() + 60 * 60 * 1_000),
		});
		const malformedJar = new CookieJar();
		malformedJar.capture([`access_token=${accessToken}`, `refresh_token=${malformedRefreshToken}`]);

		const response = await refreshSession(malformedJar);
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(response.status).toBe(401);
		expect(sessions.map(({ token }) => token)).toEqual([validRefreshToken]);
	});

	it('POST /refresh/auth rebuilds token claims from the current database identity', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const currentEmail = `${uniqueValue('current')}@tantovale.test`;
		const { db } = getTestDatabase();
		await db.update(users).set({ email: currentEmail }).where(eq(users.id, fixture.user.id));

		const response = await refreshSession(jar);
		const accessToken = cookieValue(jar.header(), 'access_token');
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const accessClaims = await verify(accessToken!, requiredSecret('ACCESS_TOKEN_SECRET'));
		const refreshClaims = await verify(refreshToken!, requiredSecret('REFRESH_TOKEN_SECRET'));

		expect(response.status).toBe(200);
		expect(accessClaims.email).toBe(currentEmail);
		expect(refreshClaims.email).toBe(currentEmail);
	});

	it('POST /refresh/auth permits exactly one concurrent rotation of the same session', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const originalJar = await loginAs(fixture);
		const accessToken = cookieValue(originalJar.header(), 'access_token');
		const refreshToken = cookieValue(originalJar.header(), 'refresh_token');
		const firstJar = new CookieJar();
		const secondJar = new CookieJar();
		firstJar.capture([`access_token=${accessToken}`, `refresh_token=${refreshToken}`]);
		secondJar.capture([`access_token=${accessToken}`, `refresh_token=${refreshToken}`]);

		const responses = await Promise.all([refreshSession(firstJar), refreshSession(secondJar)]);
		const { db } = getTestDatabase();
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.token).not.toBe(refreshToken);
	});

	it('serializes refresh-first logout by family and rejects a refresh response applied after logout', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const [sessionJar, siblingJar] = await Promise.all([loginAs(fixture), loginAs(fixture)]);
		const originalCookies = sessionJar.header();
		const siblingToken = cookieValue(siblingJar.header(), 'refresh_token');
		const { client, db } = getTestDatabase();
		const barrier = await openDedicatedTestConnection();
		let lockHeld = false;
		let pendingRefresh: Promise<Response> | undefined;
		let pendingLogout: Promise<Response> | undefined;

		await client.query(`
			CREATE FUNCTION test_hold_refresh_family_insert() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				PERFORM pg_advisory_xact_lock(hashtext(current_database()), 71001);
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER test_hold_refresh_family_insert
				BEFORE INSERT ON refresh_tokens
				FOR EACH ROW EXECUTE FUNCTION test_hold_refresh_family_insert();
		`);

		try {
			await barrier.query('SELECT pg_advisory_lock(hashtext(current_database()), 71001)');
			lockHeld = true;
			const blocker = await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
			const blockerPid = blocker.rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing refresh-family barrier PID');

			pendingRefresh = Promise.resolve(
				app.request('/refresh/auth', { method: 'POST', headers: { cookie: originalCookies } }),
			);
			await waitForBlockedStatements(barrier, blockerPid, 1, '%insert into "refresh_tokens"%');
			pendingLogout = Promise.resolve(
				app.request('/logout/auth', { method: 'POST', headers: { cookie: originalCookies } }),
			);
			const [logoutWaiter] = await waitForBlockedStatements(barrier, blockerPid, 1, '%pg_advisory_xact_lock%');
			expect(logoutWaiter?.query).toContain('pg_advisory_xact_lock');

			await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71001)');
			lockHeld = false;
		} finally {
			if (lockHeld) await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71001)');
			await Promise.allSettled([pendingRefresh, pendingLogout].filter((request) => request !== undefined));
			await client.query('DROP TRIGGER IF EXISTS test_hold_refresh_family_insert ON refresh_tokens');
			await client.query('DROP FUNCTION IF EXISTS test_hold_refresh_family_insert()');
			await barrier.end();
		}

		if (!pendingRefresh || !pendingLogout) throw new Error('Refresh/logout requests did not start');
		const [refreshResponse, logoutResponse] = await Promise.all([pendingRefresh, pendingLogout]);
		const lateAccessToken = responseCookie(refreshResponse, 'access_token');
		const lateRefreshToken = responseCookie(refreshResponse, 'refresh_token');
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(refreshResponse.status).toBe(200);
		expect(logoutResponse.status).toBe(200);
		expect(sessions.map(({ token }) => token)).toEqual([siblingToken]);
		const lateCookies = `access_token=${lateAccessToken}; refresh_token=${lateRefreshToken}`;
		expect((await app.request('/user/auth', { headers: { cookie: lateCookies } })).status).toBe(401);
		expect(
			(
				await app.request('/refresh/auth', {
					method: 'POST',
					headers: { cookie: lateCookies },
				})
			).status,
		).toBe(401);
		expect((await refreshSession(siblingJar)).status).toBe(200);
	});

	it('serializes logout-first refresh so logout consumes the family before rotation', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const [sessionJar, siblingJar] = await Promise.all([loginAs(fixture), loginAs(fixture)]);
		const originalCookies = sessionJar.header();
		const { client } = getTestDatabase();
		const barrier = await openDedicatedTestConnection();
		let lockHeld = false;
		let pendingLogout: Promise<Response> | undefined;
		let pendingRefresh: Promise<Response> | undefined;

		await client.query(`
			CREATE FUNCTION test_hold_refresh_family_delete() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				PERFORM pg_advisory_xact_lock(hashtext(current_database()), 71002);
				RETURN OLD;
			END;
			$$;
			CREATE TRIGGER test_hold_refresh_family_delete
				BEFORE DELETE ON refresh_tokens
				FOR EACH ROW EXECUTE FUNCTION test_hold_refresh_family_delete();
		`);

		try {
			await barrier.query('SELECT pg_advisory_lock(hashtext(current_database()), 71002)');
			lockHeld = true;
			const blocker = await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
			const blockerPid = blocker.rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing logout-family barrier PID');

			pendingLogout = Promise.resolve(
				app.request('/logout/auth', { method: 'POST', headers: { cookie: originalCookies } }),
			);
			await waitForBlockedStatements(barrier, blockerPid, 1, '%delete from "refresh_tokens"%');
			pendingRefresh = Promise.resolve(
				app.request('/refresh/auth', { method: 'POST', headers: { cookie: originalCookies } }),
			);
			const [refreshWaiter] = await waitForBlockedStatements(barrier, blockerPid, 1, '%pg_advisory_xact_lock%');
			expect(refreshWaiter?.query).toContain('pg_advisory_xact_lock');

			await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71002)');
			lockHeld = false;
		} finally {
			if (lockHeld) await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 71002)');
			await Promise.allSettled([pendingLogout, pendingRefresh].filter((request) => request !== undefined));
			await client.query('DROP TRIGGER IF EXISTS test_hold_refresh_family_delete ON refresh_tokens');
			await client.query('DROP FUNCTION IF EXISTS test_hold_refresh_family_delete()');
			await barrier.end();
		}

		if (!pendingLogout || !pendingRefresh) throw new Error('Logout/refresh requests did not start');
		const [logoutResponse, refreshResponse] = await Promise.all([pendingLogout, pendingRefresh]);
		expect(logoutResponse.status).toBe(200);
		expect(refreshResponse.status).toBe(401);
		expect((await refreshSession(siblingJar)).status).toBe(200);
	});

	it('uses a legacy refresh jti as its family root so logout of the original revokes its successor', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const siblingJar = await loginAs(fixture);
		const legacyJti = uniqueValue('legacy-family');
		const legacyToken = await sign(
			{
				id: fixture.user.id,
				profile_id: fixture.profile.id,
				username: fixture.user.username,
				email: fixture.user.email,
				email_verified: true,
				phone_verified: false,
				exp: Math.floor(Date.now() / 1_000) + 60 * 60,
				jti: legacyJti,
			},
			requiredSecret('REFRESH_TOKEN_SECRET'),
		);
		const { db } = getTestDatabase();
		await db.insert(refreshTokens).values({
			username: fixture.user.username,
			token: legacyToken,
			expires_at: new Date(Date.now() + 60 * 60 * 1_000),
		});
		const legacyJar = new CookieJar();
		legacyJar.capture([`refresh_token=${legacyToken}`]);

		const refreshResponse = await refreshSession(legacyJar);
		const successor = responseCookie(refreshResponse, 'refresh_token');
		const successorClaims = await verify(successor!, requiredSecret('REFRESH_TOKEN_SECRET'));
		const logoutResponse = await app.request('/logout/auth', {
			method: 'POST',
			headers: { cookie: `refresh_token=${legacyToken}` },
		});
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));

		expect(refreshResponse.status).toBe(200);
		expect(successorClaims.sid).toBe(legacyJti);
		expect(logoutResponse.status).toBe(200);
		expect(sessions.map(({ token }) => token)).toEqual([cookieValue(siblingJar.header(), 'refresh_token')]);
		expect((await refreshSession(siblingJar)).status).toBe(200);
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
		const [jar, siblingJar] = await Promise.all([loginAs(fixture), loginAs(fixture)]);
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const siblingToken = cookieValue(siblingJar.header(), 'refresh_token');
		const { db } = getTestDatabase();
		expect(refreshToken).not.toBe(siblingToken);

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

	it('POST /logout/auth revokes without rotating when the access token is unusable', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const refreshToken = cookieValue(jar.header(), 'refresh_token');
		const { db } = getTestDatabase();

		const response = await app.request('/logout/auth', {
			method: 'POST',
			headers: { cookie: `access_token=unusable; refresh_token=${refreshToken}` },
		});
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));
		const setCookies = response.headers.getSetCookie();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ message: 'Logout successful' });
		expect(sessions).toEqual([]);
		expect(setCookies).toHaveLength(2);
		expect(setCookies).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^access_token=;.*Max-Age=0/i),
				expect.stringMatching(/^refresh_token=;.*Max-Age=0/i),
			]),
		);
	});

	it('POST /logout/auth revokes the presented family while banned and unbanning cannot revive it', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const [jar, siblingJar] = await Promise.all([loginAs(fixture), loginAs(fixture)]);
		const presentedToken = cookieValue(jar.header(), 'refresh_token');
		const siblingToken = cookieValue(siblingJar.header(), 'refresh_token');
		const { db } = getTestDatabase();
		await db.update(users).set({ is_banned: true }).where(eq(users.id, fixture.user.id));

		const response = await authenticatedRequest('/logout/auth', 'POST', jar);
		await db.update(users).set({ is_banned: false }).where(eq(users.id, fixture.user.id));
		const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.username, fixture.user.username));
		const replay = new CookieJar();
		replay.capture([`refresh_token=${presentedToken}`]);

		expect(response.status).toBe(200);
		expect(sessions.map(({ token }) => token)).toEqual([siblingToken]);
		expect((await refreshSession(replay)).status).toBe(401);
		expect((await refreshSession(siblingJar)).status).toBe(200);
	});

	it('POST /logout/auth deletes production cookies with the original Domain and Path', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const initialNodeEnv = process.env.NODE_ENV;
		let response: Response;

		try {
			process.env.NODE_ENV = 'production';
			response = await authenticatedRequest('/logout/auth', 'POST', jar);
		} finally {
			process.env.NODE_ENV = initialNodeEnv;
		}

		for (const name of ['access_token', 'refresh_token']) {
			const header = responseCookieHeader(response, name);
			expect(header).toContain('Domain=tantovale.it');
			expect(header).toContain('Path=/');
			expect(header).toMatch(/Max-Age=0/i);
		}
	});

	it('POST /logout/auth rejects an invalid refresh session and still clears both cookies', async () => {
		const response = await app.request('/logout/auth', {
			method: 'POST',
			headers: { cookie: 'access_token=unusable; refresh_token=malformed' },
		});
		const setCookies = response.headers.getSetCookie();

		expect(response.status).toBe(401);
		expect(setCookies).toHaveLength(2);
		expect(setCookies).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^access_token=;.*Max-Age=0/i),
				expect.stringMatching(/^refresh_token=;.*Max-Age=0/i),
			]),
		);
	});

	it('POST /logout/auth returns 401 when the logged-out cookie jar is reused', async () => {
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		expect((await authenticatedRequest('/logout/auth', 'POST', jar)).status).toBe(200);

		const reused = await authenticatedRequest('/logout/auth', 'POST', jar);
		expect(reused.status).toBe(401);
	});
});
