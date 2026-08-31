import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import { refreshTokens } from '../../src/database/schemas/schema';
import { createUserFixture } from '../fixtures/factories';
import { loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';

const authBridgeModulePath = '../../../storefront/src/utils/auth-cookie-bridge';

async function loadAuthBridge() {
	return import(/* @vite-ignore */ authBridgeModulePath) as Promise<{
		bridgeAuthCookies(
			headers: Headers,
			cookieStore: { set(cookie: unknown): unknown },
			options?: { requireCompletePair?: boolean },
		): number;
		bridgeAuthLogout(input: {
			accessToken?: string;
			refreshToken?: string;
			cookieStore: { set(cookie: unknown): unknown };
			isProductionMode: boolean;
			requestLogout(cookieHeader: string): Promise<Response>;
		}): Promise<{ upstreamStatus?: number }>;
	}>;
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
	return cookieHeader
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

function recordingCookieStore() {
	const writes: unknown[] = [];
	return {
		writes,
		store: {
			set(cookie: unknown) {
				writes.push(cookie);
			},
		},
	};
}

describe('storefront auth cookie bridge', () => {
	it('copies two allowlisted Set-Cookie headers independently with every security and scope attribute', async () => {
		const { bridgeAuthCookies } = await loadAuthBridge();
		const headers = new Headers();
		headers.append(
			'set-cookie',
			'access_token=access-secret; Path=/; Domain=tantovale.it; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Max-Age=900; HttpOnly; Secure; SameSite=None; Priority=High; Partitioned',
		);
		headers.append(
			'set-cookie',
			'refresh_token=refresh-secret; Path=/auth; Expires=Thu, 22 Oct 2037 07:28:00 GMT; Max-Age=1800; HttpOnly; Secure; SameSite=Lax; Priority=Medium',
		);
		headers.append('set-cookie', 'session=must-not-cross; Path=/');
		const { store, writes } = recordingCookieStore();
		const consoleSpies = [
			vi.spyOn(console, 'log').mockImplementation(() => undefined),
			vi.spyOn(console, 'warn').mockImplementation(() => undefined),
			vi.spyOn(console, 'error').mockImplementation(() => undefined),
		];

		try {
			expect(bridgeAuthCookies(headers, store)).toBe(2);
			expect(writes).toEqual([
				expect.objectContaining({
					name: 'access_token',
					value: 'access-secret',
					domain: 'tantovale.it',
					path: '/',
					expires: new Date('2037-10-21T07:28:00.000Z'),
					maxAge: 900,
					httpOnly: true,
					secure: true,
					sameSite: 'none',
					priority: 'high',
					partitioned: true,
				}),
				expect.objectContaining({
					name: 'refresh_token',
					value: 'refresh-secret',
					path: '/auth',
					expires: new Date('2037-10-22T07:28:00.000Z'),
					maxAge: 1800,
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					priority: 'medium',
				}),
			]);
			expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
		} finally {
			for (const spy of consoleSpies) spy.mockRestore();
		}
	});

	it('fails closed without copying either token when a complete login pair is not present', async () => {
		const { bridgeAuthCookies } = await loadAuthBridge();
		const headers = new Headers();
		headers.append('set-cookie', 'access_token=orphaned-access; Path=/; HttpOnly; Secure; SameSite=None');
		const { store, writes } = recordingCookieStore();

		expect(bridgeAuthCookies(headers, store, { requireCompletePair: true })).toBe(0);
		expect(writes).toEqual([]);
	});

	it('forwards the original cookie pair, revokes the real backend session, and always clears local cookies', async () => {
		const { bridgeAuthLogout } = await loadAuthBridge();
		const fixture = await createUserFixture({ emailVerified: true });
		const jar = await loginAs(fixture);
		const originalCookieHeader = jar.header();
		const accessToken = cookieValue(originalCookieHeader, 'access_token');
		const refreshToken = cookieValue(originalCookieHeader, 'refresh_token');
		if (!accessToken || !refreshToken) throw new Error('Missing login cookies');
		const { db } = getTestDatabase();
		expect(await db.select().from(refreshTokens).where(eq(refreshTokens.token, refreshToken))).toHaveLength(1);
		const { store, writes } = recordingCookieStore();
		const consoleSpies = [
			vi.spyOn(console, 'log').mockImplementation(() => undefined),
			vi.spyOn(console, 'warn').mockImplementation(() => undefined),
			vi.spyOn(console, 'error').mockImplementation(() => undefined),
		];

		try {
			const result = await bridgeAuthLogout({
				accessToken,
				refreshToken,
				cookieStore: store,
				isProductionMode: false,
				requestLogout: async (cookie) => await app.request('/logout/auth', { method: 'POST', headers: { cookie } }),
			});
			expect(result.upstreamStatus).toBe(200);
			expect(await db.select().from(refreshTokens).where(eq(refreshTokens.token, refreshToken))).toEqual([]);
			expect(
				(
					await app.request('/refresh/auth', {
						method: 'POST',
						headers: { cookie: originalCookieHeader },
					})
				).status,
			).toBe(401);
			expect(writes).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: 'access_token', value: '', path: '/', maxAge: 0 }),
					expect.objectContaining({ name: 'refresh_token', value: '', path: '/', maxAge: 0 }),
				]),
			);
			expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
		} finally {
			for (const spy of consoleSpies) spy.mockRestore();
		}
	});

	it('treats missing cookies idempotently while still emitting local deletion cookies', async () => {
		const { bridgeAuthLogout } = await loadAuthBridge();
		const { store, writes } = recordingCookieStore();
		const result = await bridgeAuthLogout({
			cookieStore: store,
			isProductionMode: false,
			requestLogout: async (cookie) => await app.request('/logout/auth', { method: 'POST', headers: { cookie } }),
		});

		expect(result.upstreamStatus).toBe(401);
		expect(writes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'access_token', value: '', path: '/', maxAge: 0 }),
				expect.objectContaining({ name: 'refresh_token', value: '', path: '/', maxAge: 0 }),
			]),
		);
	});

	it('keeps login and email verification free of direct token logging', async () => {
		const [loginSource, verifySource] = await Promise.all([
			readFile(new URL('../../../storefront/src/app/login/actions.ts', import.meta.url), 'utf8'),
			readFile(new URL('../../../storefront/src/app/api/verify/email/route.ts', import.meta.url), 'utf8'),
		]);

		expect(loginSource).not.toMatch(/console\.(?:log|warn|error)/);
		expect(verifySource).not.toMatch(/console\.(?:log|warn|error)/);
	});
});
