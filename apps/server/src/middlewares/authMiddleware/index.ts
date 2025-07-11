import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';

import { users } from '../../database/schemas/users';
import { createClient } from '../../database';
import { createNewAccessToken, invalidateTokens, validateRefreshToken } from './utils';
import { getNodeEnvMode } from '../../utils/constants';
import type { AppBindings } from '../../lib/types';
import { profiles } from '#database/schemas/profiles';

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
	const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, NODE_ENV } = env<{
		ACCESS_TOKEN_SECRET: string;
		REFRESH_TOKEN_SECRET: string;
		NODE_ENV: string;
	}>(c);
	const { isProductionMode } = getNodeEnvMode(NODE_ENV);

	const { db } = createClient();

	try {
		const access_token = getCookie(c, 'access_token');
		const refresh_token = getCookie(c, 'refresh_token');

		// Check if both tokens are present
		if (!access_token || !refresh_token) {
			await invalidateTokens(c, db);
			return c.json({ message: 'Unauthorized - No Token' }, 401);
		}

		let payload;
		let tokenExpired = false;

		try {
			// Verify access token
			payload = await verify(access_token, ACCESS_TOKEN_SECRET);
			const exp = Number(payload?.exp);
			tokenExpired = exp * 1000 < Date.now();
		} catch (error) {
			tokenExpired = true;
		}

		// If access token is expired, attempt to refresh
		if (tokenExpired) {
			try {
				// Validate refresh token
				const storedRefreshToken = await validateRefreshToken(c, db);

				// Create new access token
				const tokenResult = await createNewAccessToken(
					c,
					db,
					storedRefreshToken.username,
					ACCESS_TOKEN_SECRET,
					isProductionMode,
				);

				payload = tokenResult.payload;

				c.set('user', tokenResult.user);
			} catch (error) {
				await invalidateTokens(c, db);

				return c.json({ message: `Unauthorized - storedRefreshToken error` }, 401);
			}
		} else {
			// Validate user for non-expired access token
			const user_id = Number(payload?.id);

			const [existingUser] = await db
				.select({
					id: users.id,
					email: users.email,
					username: users.username,
					email_verified: users.email_verified,
					phone_verified: users.phone_verified,
					profile_id: profiles.id,
				})
				.from(users)
				.innerJoin(profiles, eq(users.id, profiles.user_id))
				.where(eq(users.id, user_id))
				.limit(1);

			if (!existingUser) {
				await invalidateTokens(c, db);
				return c.json({ message: 'Unauthorized - User not found' }, 401);
			}

			// Set user in context
			c.set('user', {
				id: existingUser.id,
				profile_id: existingUser.profile_id,
				email: existingUser.email,
				username: existingUser.username,
				email_verified: existingUser.email_verified,
				phone_verified: existingUser.phone_verified,
			});
		}

		await next();
	} catch (error) {
		console.error('Auth Middleware Error:\n', error, '\n');

		await invalidateTokens(c, db);

		return c.json({ message: 'Authentication failed' }, 401);
	}
}
