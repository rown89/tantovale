import { describe, expect, it, vi } from 'vitest';

const loginActionPath = '../../../storefront/src/app/login/actions';
const verifyRoutePath = '../../../storefront/src/app/api/verify/email/route';
const logoutRoutePath = '../../../storefront/src/app/api/logout/route';

type CookieWrite = {
	name: string;
	value: string;
	path?: string;
	domain?: string;
	expires?: Date;
	maxAge?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: string;
	priority?: string;
	partitioned?: boolean;
};

function authHeaders() {
	const headers = new Headers();
	headers.append(
		'set-cookie',
		'access_token=entry-access; Path=/; Domain=tantovale.it; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Max-Age=900; HttpOnly; Secure; SameSite=None; Priority=High; Partitioned',
	);
	headers.append(
		'set-cookie',
		'refresh_token=entry-refresh; Path=/auth; Expires=Thu, 22 Oct 2037 07:28:00 GMT; Max-Age=1800; HttpOnly; Secure; SameSite=Lax; Priority=Medium',
	);
	return headers;
}

function cookieStore(values: Record<string, string> = {}) {
	const writes: CookieWrite[] = [];
	return {
		writes,
		store: {
			get(name: string) {
				const value = values[name];
				return value === undefined ? undefined : { name, value };
			},
			set(cookie: CookieWrite) {
				writes.push(cookie);
			},
		},
	};
}

function expectBridgedAttributes(writes: CookieWrite[]) {
	expect(writes).toEqual([
		expect.objectContaining({
			name: 'access_token',
			value: 'entry-access',
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
			value: 'entry-refresh',
			path: '/auth',
			expires: new Date('2037-10-22T07:28:00.000Z'),
			maxAge: 1800,
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			priority: 'medium',
		}),
	]);
}

describe('storefront auth entry points', () => {
	it('submitLogin bridges both upstream cookies with complete attributes through the real server action', async () => {
		const { store, writes } = cookieStore();
		const login = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					user: {
						id: 7,
						profile_id: 17,
						username: 'buyer',
						email_verified: true,
						phone_verified: false,
					},
				}),
				{ status: 200, headers: authHeaders() },
			),
		);
		const { submitLogin } = (await import(/* @vite-ignore */ loginActionPath)) as unknown as {
			submitLogin(
				previous: null,
				formData: FormData,
				dependencies: { loginPost: typeof login; getCookieStore(): Promise<typeof store> },
			): Promise<{ success: boolean }>;
		};
		const formData = new FormData();
		formData.set('email', 'buyer@example.com');
		formData.set('password', 'StrongPassword1!');
		const result = await submitLogin(null, formData, {
			loginPost: login,
			getCookieStore: async () => store,
		});

		expect(result.success).toBe(true);
		expect(login).toHaveBeenCalledWith({ json: { email: 'buyer@example.com', password: 'StrongPassword1!' } });
		expectBridgedAttributes(writes);
	});

	it('the real verification route deletes activation state and redirects to login without bridging auth cookies', async () => {
		const { store, writes } = cookieStore();
		const verify = vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: authHeaders() }));
		const { GET } = (await import(/* @vite-ignore */ verifyRoutePath)) as unknown as {
			GET(
				request: { nextUrl: URL; url: string },
				context: {
					params: Promise<unknown>;
					dependencies: { verifyGet: typeof verify; getCookieStore(): Promise<typeof store> };
				},
			): Promise<Response>;
		};
		const url = 'http://localhost/api/verify/email?token=verify-token';
		const response = await GET(
			{ nextUrl: new URL(url), url },
			{
				params: Promise.resolve({}),
				dependencies: {
					verifyGet: verify,
					getCookieStore: async () => store,
				},
			},
		);

		expect(verify).toHaveBeenCalledWith({ query: { token: 'verify-token' } });
		expect(response.status).toBe(307);
		expect(response.headers.get('location')).toBe('http://localhost/login');
		expect(writes).toEqual([
			expect.objectContaining({ name: 'email_activation_token', value: '', path: '/', maxAge: 0 }),
		]);
	});

	it('the real verification route fails safely when the upstream verification request throws', async () => {
		const { store, writes } = cookieStore({
			access_token: 'existing-access',
			refresh_token: 'existing-refresh',
		});
		const verify = vi.fn().mockRejectedValue(new Error('upstream unavailable'));
		const { GET } = (await import(/* @vite-ignore */ verifyRoutePath)) as unknown as {
			GET(
				request: { nextUrl: URL; url: string },
				context: {
					params: Promise<unknown>;
					dependencies: { verifyGet: typeof verify; getCookieStore(): Promise<typeof store> };
				},
			): Promise<Response>;
		};
		const url = 'http://localhost/api/verify/email?token=verify-token';

		const response = await GET(
			{ nextUrl: new URL(url), url },
			{
				params: Promise.resolve({}),
				dependencies: { verifyGet: verify, getCookieStore: async () => store },
			},
		);

		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: 'Unable to verify email' });
		expect(writes).toEqual([]);
	});

	it('the real logout route forwards the original cookie pair before always deleting local cookies', async () => {
		const { store, writes } = cookieStore({
			access_token: 'original-access',
			refresh_token: 'original-refresh',
		});
		const logout = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const { GET } = (await import(/* @vite-ignore */ logoutRoutePath)) as unknown as {
			GET(
				request: { url: string },
				context: {
					params: Promise<unknown>;
					dependencies: { logoutPost: typeof logout; getCookieStore(): Promise<typeof store> };
				},
			): Promise<Response>;
		};
		const response = await GET(
			{ url: 'http://localhost/api/logout' },
			{
				params: Promise.resolve({}),
				dependencies: { logoutPost: logout, getCookieStore: async () => store },
			},
		);

		expect(logout).toHaveBeenCalledWith(
			{},
			{
				headers: { cookie: 'access_token=original-access; refresh_token=original-refresh' },
				init: { credentials: 'include' },
			},
		);
		expect(writes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'access_token', value: '', path: '/', maxAge: 0 }),
				expect.objectContaining({ name: 'refresh_token', value: '', path: '/', maxAge: 0 }),
			]),
		);
		expect(response.status).toBe(307);
		expect(response.headers.get('location')).toBe('http://localhost/');
	});
});
