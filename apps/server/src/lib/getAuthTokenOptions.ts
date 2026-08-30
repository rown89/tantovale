import type { CookieOptions } from 'hono/utils/cookie';

function getAuthTokenScope(isProductionMode?: boolean): CookieOptions {
	return {
		secure: true,
		httpOnly: true,
		sameSite: 'None',
		path: '/',
		domain: isProductionMode ? 'tantovale.it' : undefined,
	};
}

export function getAuthTokenOptions({
	isProductionMode,
	expires,
}: {
	isProductionMode?: boolean;
	expires: Date;
}): CookieOptions {
	return {
		...getAuthTokenScope(isProductionMode),
		maxAge: Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 1_000)),
		expires,
	};
}

export function getAuthTokenDeleteOptions({ isProductionMode }: { isProductionMode?: boolean }): CookieOptions {
	return getAuthTokenScope(isProductionMode);
}
