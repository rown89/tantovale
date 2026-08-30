import { randomUUID } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import { getCookie, setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import { describeRoute } from 'hono-openapi';
import { env } from 'hono/adapter';

import { createClient } from '../../database/index';
import { refreshTokens } from '../../database/schemas/schema';
import { tokenPayload } from '../../lib/tokenPayload';
import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import {
	DEFAULT_REFRESH_TOKEN_EXPIRES,
	DEFAULT_ACCESS_TOKEN_EXPIRES,
	getNodeEnvMode,
	authPath,
} from '../../utils/constants';
import { createRouter } from '../../lib/create-app';
import { authMiddleware } from '../../middlewares/authMiddleware/index';
import { verifyRefreshTokenClaims } from '../../middlewares/authMiddleware/utils';

export const refreshRoute = createRouter().post(
	`/${authPath}`,
	authMiddleware,
	describeRoute({
		description: 'Refresh token verifier',
		responses: {
			200: {
				description: 'Tokens refreshed successfully',
			},
		},
	}),
	async (c) => {
		const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, NODE_ENV } = env<{
			ACCESS_TOKEN_SECRET: string;
			REFRESH_TOKEN_SECRET: string;
			NODE_ENV: string;
		}>(c);

		const { isProductionMode } = getNodeEnvMode(NODE_ENV);
		const refresh_token = getCookie(c, 'refresh_token');

		if (!refresh_token) {
			return c.json({ message: 'No refresh token provided' }, 401);
		}

		const { db } = createClient();
		let claims;
		try {
			claims = await verifyRefreshTokenClaims(refresh_token, REFRESH_TOKEN_SECRET);
		} catch {
			await db.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
			return c.json({ message: 'Invalid refresh token' }, 401);
		}

		try {
			const user = c.var.user;
			if (
				!user ||
				claims.id !== user.id ||
				claims.profile_id !== user.profile_id ||
				claims.username !== user.username
			) {
				await db.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
				return c.json({ message: 'Invalid refresh token' }, 401);
			}
			const accessTokenExpires = DEFAULT_ACCESS_TOKEN_EXPIRES();
			const refreshTokenExpires = DEFAULT_REFRESH_TOKEN_EXPIRES();

			const access_token_payload = tokenPayload({
				...user,
				exp: Math.floor(accessTokenExpires.getTime() / 1_000),
			});

			const refresh_token_payload = tokenPayload({
				...user,
				exp: Math.floor(refreshTokenExpires.getTime() / 1_000),
			});

			// Generate and sign tokens
			const new_access_token = await sign({ ...access_token_payload, jti: randomUUID() }, ACCESS_TOKEN_SECRET);
			const new_refresh_token = await sign({ ...refresh_token_payload, jti: randomUUID() }, REFRESH_TOKEN_SECRET);
			const rotated = await db.transaction(async (tx) => {
				const [consumedToken] = await tx
					.delete(refreshTokens)
					.where(and(eq(refreshTokens.token, refresh_token), gt(refreshTokens.expires_at, new Date())))
					.returning();

				if (!consumedToken || consumedToken.username !== user.username) {
					await tx.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
					return false;
				}

				await tx.insert(refreshTokens).values({
					username: user.username,
					token: new_refresh_token,
					expires_at: refreshTokenExpires,
				});
				return true;
			});

			if (!rotated) {
				return c.json({ message: 'Invalid refresh token' }, 401);
			}

			setCookie(c, 'access_token', new_access_token, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: accessTokenExpires,
				}),
			});
			setCookie(c, 'refresh_token', new_refresh_token, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: refreshTokenExpires,
				}),
			});

			return c.json({ message: 'Tokens refreshed successfully' }, 200);
		} catch {
			return c.json({ message: 'Error refreshing tokens' }, 500);
		}
	},
);
