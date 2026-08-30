import { afterEach, describe, expect, it, vi } from 'vitest';

import { users } from '../../src/database/schemas/users';
import { isPasswordWithinBcryptByteLimit, passwordSchema } from '../../src/extended_schemas/password';
import { hashPassword, verifyPassword } from '../../src/lib/password';
import { createUserFixture } from '../fixtures/factories';
import { authenticatedRequest, loginAs } from './auth';
import { getTestDatabase } from './database';
import { extractTokenFromLink, waitForEmail } from './mailpit';
import { captureCookies, CookieJar, jsonRequest } from './request';

/* eslint-disable turbo/no-undeclared-env-vars -- Tests exercise the local Mailpit guard provided by the test harness. */
const initialMailpitApiUrl = process.env.MAILPIT_API_URL;

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	process.env.MAILPIT_API_URL = initialMailpitApiUrl;
});

describe('API test helpers', () => {
	it('validates the bcrypt password boundary with browser-safe UTF-8 semantics', () => {
		expect(isPasswordWithinBcryptByteLimit('a'.repeat(72))).toBe(true);
		expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true);
		expect(passwordSchema.safeParse('é'.repeat(36)).success).toBe(true);
		expect(isPasswordWithinBcryptByteLimit('a'.repeat(73))).toBe(false);
		expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
		expect(passwordSchema.safeParse('é'.repeat(37)).success).toBe(false);
	});

	it("rejects hashing passwords beyond bcrypt's 72 UTF-8 byte boundary", async () => {
		await expect(hashPassword('a'.repeat(73))).rejects.toThrow('72');
		await expect(hashPassword('é'.repeat(37))).rejects.toThrow('72');
	});

	it('updates a cookie jar from multiple Set-Cookie headers', () => {
		const jar = new CookieJar();

		jar.capture(['access_token=one; Path=/; HttpOnly', 'refresh_token=two; Path=/; HttpOnly']);

		expect(jar.header()).toBe('access_token=one; refresh_token=two');

		jar.capture(['access_token=; Max-Age=0; Path=/']);

		expect(jar.header()).toBe('refresh_token=two');
	});

	it('keeps empty values and deletes cookies with expired lifetime attributes', () => {
		const jar = new CookieJar();
		jar.capture([
			'empty=; Path=/',
			'access_token=one',
			'access_token=two; MAX-age = -1',
			'refresh_token=two',
			'refresh_token=three; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
		]);

		expect(jar.header()).toBe('empty=');
	});

	it('honors Max-Age over Expires and removes expired stored cookies from headers', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
		const jar = new CookieJar();
		jar.capture([
			'access_token=one; Max-Age=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
			'refresh_token=two; Expires=Tue, 01 Jan 2030 00:00:02 GMT',
		]);

		expect(jar.header()).toBe('access_token=one; refresh_token=two');
		vi.setSystemTime(new Date('2030-01-01T00:00:01.001Z'));
		expect(jar.header()).toBe('refresh_token=two');
		vi.setSystemTime(new Date('2030-01-01T00:00:02.001Z'));
		expect(jar.header()).toBe('');
	});

	it('ignores invalid cookie names and preserves values containing equals signs', () => {
		const jar = new CookieJar();
		jar.capture(['=blank', 'has space=value', 'token=abc=def; Path=/']);

		expect(jar.header()).toBe('token=abc=def');
	});

	it('builds JSON requests with an optional cookie header and body', () => {
		const jar = new CookieJar();
		jar.capture(['access_token=one']);

		expect(jsonRequest('POST', { email: 'user@tantovale.test' }, jar)).toEqual({
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: 'access_token=one',
			},
			body: JSON.stringify({ email: 'user@tantovale.test' }),
		});
		expect(jsonRequest('GET', undefined, new CookieJar())).toEqual({
			method: 'GET',
			headers: { 'content-type': 'application/json' },
		});
	});

	it('captures cookies from a real Headers getSetCookie API', () => {
		const jar = new CookieJar();
		const headers = new Headers();
		headers.append('set-cookie', 'access_token=one; Path=/');
		headers.append('set-cookie', 'refresh_token=two; Path=/');

		captureCookies(new Response(null, { headers }), jar);

		expect(jar.header()).toBe('access_token=one; refresh_token=two');
	});

	it('extracts a named token from an email link', () => {
		expect(extractTokenFromLink('Visit http://storefront.test/verify?token=abc.def', 'token')).toBe('abc.def');
	});

	it('extracts parameters from the first candidate that contains it', () => {
		const content = [
			'<a href="https://tracking.test/open?id=one">Open</a>',
			"<a href='https://storefront.test/verify?token=abc.def&amp;source=email'>Verify</a>",
		].join(' ');

		expect(extractTokenFromLink(content, 'token')).toBe('abc.def');
	});

	it('trims trailing prose punctuation from plaintext links', () => {
		expect(extractTokenFromLink('Finish signup: https://storefront.test/verify?token=abc.def.', 'token')).toBe(
			'abc.def',
		);
	});

	it('reports missing email links and parameters', () => {
		expect(() => extractTokenFromLink('No link here', 'token')).toThrow('Email contains no HTTP link');
		expect(() => extractTokenFromLink('https://storefront.test/verify', 'token')).toThrow(
			'Email link has no token parameter',
		);
	});

	it('permits loopback Mailpit URLs but rejects credentials and remote services', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		process.env.MAILPIT_API_URL = 'http://[::1]:8025';
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					messages: [{ ID: 'message/id', Subject: 'Subject', To: [{ Address: 'user@tantovale.test' }] }],
				}),
			),
		);
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ HTML: '<p>Hi</p>', Text: 'Hi' })));

		await expect(waitForEmail('user@tantovale.test', 'Subject')).resolves.toEqual({ HTML: '<p>Hi</p>', Text: 'Hi' });
		expect(fetchMock.mock.calls[0]?.[0]).toBe('http://[::1]:8025/api/v1/search?query=to%3Auser%40tantovale.test');
		expect(fetchMock.mock.calls[1]?.[0]).toBe('http://[::1]:8025/api/v1/message/message%2Fid');

		process.env.MAILPIT_API_URL = 'http://user:pass@localhost:8025';
		await expect(waitForEmail('user@tantovale.test', 'Subject')).rejects.toThrow('Unsafe Mailpit API URL');
		process.env.MAILPIT_API_URL = 'http://mailpit.example.test:8025';
		await expect(waitForEmail('user@tantovale.test', 'Subject')).rejects.toThrow('Unsafe Mailpit API URL');
	});

	it('retries transient Mailpit failures before returning a matching email', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		process.env.MAILPIT_API_URL = 'http://localhost:8025';
		fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					messages: [{ ID: 'message-id', Subject: 'Subject', To: [{ Address: 'user@tantovale.test' }] }],
				}),
			),
		);
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ HTML: '<p>Hi</p>', Text: 'Hi' })));

		const email = waitForEmail('user@tantovale.test', 'Subject');
		await vi.advanceTimersByTimeAsync(50);

		await expect(email).resolves.toEqual({ HTML: '<p>Hi</p>', Text: 'Hi' });
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('retries a transient Mailpit response-body timeout before returning a matching email', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		process.env.MAILPIT_API_URL = 'http://localhost:8025';
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.reject(Object.assign(new Error('body timed out'), { name: 'TimeoutError' })),
		});
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					messages: [{ ID: 'message-id', Subject: 'Subject', To: [{ Address: 'user@tantovale.test' }] }],
				}),
			),
		);
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ HTML: '<p>Hi</p>', Text: 'Hi' })));

		const email = waitForEmail('user@tantovale.test', 'Subject');
		const result = expect(email).resolves.toEqual({ HTML: '<p>Hi</p>', Text: 'Hi' });
		await vi.advanceTimersByTimeAsync(50);

		await result;
	});

	it('fails immediately for terminal Mailpit responses', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response('bad request', { status: 400, statusText: 'Bad Request' }));
		vi.stubGlobal('fetch', fetchMock);
		process.env.MAILPIT_API_URL = 'http://localhost:8025';

		await expect(waitForEmail('user@tantovale.test', 'Subject')).rejects.toThrow(
			'Mailpit API request failed: 400 Bad Request',
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('includes the final transient failure in its Mailpit timeout', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockRejectedValue(new Error('connection reset'));
		vi.stubGlobal('fetch', fetchMock);
		process.env.MAILPIT_API_URL = 'http://localhost:8025';

		const email = waitForEmail('user@tantovale.test', 'Subject');
		const timeout = expect(email).rejects.toThrow(
			/Email not received for user@tantovale\.test with subject Subject.*connection reset/,
		);
		await vi.runAllTimersAsync();

		await timeout;
	});
});

describe('test fixtures', () => {
	it('authenticates a verified user fixture through the public login route', async () => {
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

	it('persists a linked profile and hashes the selected plaintext password', async () => {
		const password = 'DifferentStrongPass123!';
		const fixture = await createUserFixture({
			password,
			emailVerified: false,
			user: { phone: '123456789', password: 'must-not-be-stored', email_verified: true },
			profile: { user_id: -1, name: 'Ada', surname: 'Lovelace', gender: 'female', marketing_policy: true },
		});

		expect(fixture.password).toBe(password);
		expect(fixture.user.email_verified).toBe(false);
		expect(fixture.user.phone).toBe('123456789');
		expect(fixture.user.password).not.toBe('must-not-be-stored');
		expect(await verifyPassword(fixture.user.password, password)).toBe(true);
		expect(fixture.profile).toMatchObject({
			user_id: fixture.user.id,
			name: 'Ada',
			surname: 'Lovelace',
			marketing_policy: true,
		});
	});

	it('rolls back the user when its linked profile cannot be inserted', async () => {
		const { db } = getTestDatabase();

		await expect(
			createUserFixture({
				profile: { name: null } as unknown as NonNullable<Parameters<typeof createUserFixture>[0]>['profile'],
			}),
		).rejects.toThrow();

		expect(await db.select().from(users)).toEqual([]);
	});
});
