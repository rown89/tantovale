import { getCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';

import { users } from '../../database/schemas/users';
import { createClient } from '../../database';
import { invalidateTokens, rotateRefreshSession, verifyAccessTokenClaims } from './utils';
import { getNodeEnvMode } from '../../utils/constants';
import type { AppBindings } from '../../lib/types';
import { profiles } from '#database/schemas/profiles';

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
	if (c.get('user')) {
		await next();
		return;
	}

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
			await invalidateTokens(c, db, isProductionMode);
			return c.json({ message: 'Unauthorized - No Token' }, 401);
		}

		let accessClaims;
		try {
			accessClaims = await verifyAccessTokenClaims(access_token, ACCESS_TOKEN_SECRET);
		} catch {
			try {
				await rotateRefreshSession({
					c,
					db,
					refreshToken: refresh_token,
					accessTokenSecret: ACCESS_TOKEN_SECRET,
					refreshTokenSecret: REFRESH_TOKEN_SECRET,
					isProductionMode,
				});
			} catch {
				await invalidateTokens(c, db, isProductionMode);
				return c.json({ message: `Unauthorized - storedRefreshToken error` }, 401);
			}

			await next();
			return;
		}

		const [existingUser] = await db
			.select({
				id: users.id,
				email: users.email,
				username: users.username,
				email_verified: users.email_verified,
				phone_verified: users.phone_verified,
				profile_id: profiles.id,
				is_banned: users.is_banned,
			})
			.from(users)
			.innerJoin(profiles, eq(users.id, profiles.user_id))
			.where(eq(users.id, accessClaims.id))
			.limit(1);

		if (!existingUser || existingUser.is_banned) {
			await invalidateTokens(c, db, isProductionMode);
			return c.json({ message: 'Unauthorized - User not found' }, 401);
		}

		c.set('user', {
			id: existingUser.id,
			profile_id: existingUser.profile_id,
			email: existingUser.email,
			username: existingUser.username,
			email_verified: existingUser.email_verified,
			phone_verified: existingUser.phone_verified,
		});

		await next();
	} catch {
		await invalidateTokens(c, db, isProductionMode);

		return c.json({ message: 'Authentication failed' }, 401);
	}
}
