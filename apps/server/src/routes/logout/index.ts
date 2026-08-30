import { deleteCookie, getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { env } from 'hono/adapter';

import { createClient } from '../../database';
import { refreshTokens } from '../../database/schemas/refreshTokens';
import { createRouter } from '../../lib/create-app';
import { getAuthTokenDeleteOptions } from '../../lib/getAuthTokenOptions';
import { verifyRefreshTokenClaims } from '../../middlewares/authMiddleware/utils';
import { authPath, getNodeEnvMode } from '../../utils/constants';

export const logoutRoute = createRouter().post(`/${authPath}`, async (c) => {
	const { REFRESH_TOKEN_SECRET, NODE_ENV } = env<{
		REFRESH_TOKEN_SECRET: string;
		NODE_ENV: string;
	}>(c);
	const { isProductionMode } = getNodeEnvMode(NODE_ENV);
	const refreshToken = getCookie(c, 'refresh_token');
	const deleteOptions = getAuthTokenDeleteOptions({ isProductionMode });
	deleteCookie(c, 'access_token', deleteOptions);
	deleteCookie(c, 'refresh_token', deleteOptions);

	if (!refreshToken) {
		return c.json({ message: 'Logout error - no refresh token' }, 401);
	}

	const { db } = createClient();
	try {
		const claims = await verifyRefreshTokenClaims(refreshToken, REFRESH_TOKEN_SECRET);
		const [revokedSession] = await db
			.delete(refreshTokens)
			.where(eq(refreshTokens.token, refreshToken))
			.returning({ expiresAt: refreshTokens.expires_at, username: refreshTokens.username });

		if (
			!revokedSession ||
			revokedSession.username !== claims.username ||
			revokedSession.expiresAt.getTime() <= Date.now()
		) {
			return c.json({ message: 'Logout error' }, 401);
		}

		return c.json({ message: 'Logout successful' }, 200);
	} catch {
		try {
			await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
		} catch {
			// Cookies are still cleared locally when session revocation storage is unavailable.
		}
		return c.json({ message: 'Logout error' }, 401);
	}
});
