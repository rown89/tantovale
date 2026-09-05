import { parseSetCookie, type ResponseCookie } from '@edge-runtime/cookies';

type AuthCookieStore = {
	set(cookie: ResponseCookie): unknown;
};

const authCookieNames = new Set(['access_token', 'refresh_token']);

export function bridgeAuthCookies(
	headers: Headers,
	cookieStore: AuthCookieStore,
	options: { requireCompletePair?: boolean } = {},
): number {
	const cookiesByName = new Map<string, ResponseCookie>();
	for (const setCookie of headers.getSetCookie()) {
		const cookie = parseSetCookie(setCookie);
		if (!cookie || !authCookieNames.has(cookie.name)) continue;
		cookiesByName.set(cookie.name, cookie);
	}

	if (options.requireCompletePair && [...authCookieNames].some((name) => !cookiesByName.has(name))) {
		return 0;
	}

	for (const cookie of cookiesByName.values()) {
		cookieStore.set(cookie);
	}
	return cookiesByName.size;
}

function safeCookiePair(name: string, value?: string): string | undefined {
	if (!value || /[;\r\n]/.test(value)) return undefined;
	return `${name}=${value}`;
}

function expireLocalAuthCookies(cookieStore: AuthCookieStore, isProductionMode: boolean): void {
	for (const name of authCookieNames) {
		cookieStore.set({
			name,
			value: '',
			expires: new Date(0),
			maxAge: 0,
			httpOnly: true,
			secure: true,
			sameSite: 'none',
			path: '/',
			...(isProductionMode ? { domain: 'tantovale.it' } : {}),
		});
	}
}

export async function bridgeAuthLogout(input: {
	accessToken?: string;
	refreshToken?: string;
	cookieStore: AuthCookieStore;
	isProductionMode: boolean;
	requestLogout(cookieHeader: string): Promise<Response>;
}): Promise<{ upstreamStatus?: number }> {
	const cookieHeader = [
		safeCookiePair('access_token', input.accessToken),
		safeCookiePair('refresh_token', input.refreshToken),
	]
		.filter((pair): pair is string => pair !== undefined)
		.join('; ');

	try {
		const response = await input.requestLogout(cookieHeader);
		bridgeAuthCookies(response.headers, input.cookieStore);
		return { upstreamStatus: response.status };
	} catch {
		return {};
	} finally {
		expireLocalAuthCookies(input.cookieStore, input.isProductionMode);
	}
}
