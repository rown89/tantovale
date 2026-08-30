import { deleteCookie, getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import { env } from 'hono/adapter';
import { createClient } from '../../database';
import { refreshTokens } from '../../database/schemas/refreshTokens';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';

export const logoutRoute = createRouter().post(`/${authPath}`, authMiddleware, async (c) => {
	const { REFRESH_TOKEN_SECRET } = env<{
		REFRESH_TOKEN_SECRET: string;
	}>(c);

	// Get the refresh token from the cookie
	const refreshToken = getCookie(c, 'refresh_token');

	if (!refreshToken) {
		return c.json({ message: 'Logout error - no refresh token' }, 401);
	}

	try {
		await verify(refreshToken, REFRESH_TOKEN_SECRET);

		const { db } = createClient();
		// Remove refresh token
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));

		// Delete cookies
		deleteCookie(c, 'access_token');
		deleteCookie(c, 'refresh_token');

		return c.json({ message: 'Logout successful' }, 200);
	} catch (error) {
		return c.json({ message: 'Logout error' }, 401);
	}
});
