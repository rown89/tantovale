import { eq } from 'drizzle-orm';
import { getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { describeRoute } from 'hono-openapi';
import { createClient } from '#database';
import { refreshTokens } from '#database/schemas/schema';
import { tokenPayload } from '#lib/tokenPayload';
import { getAuthTokenOptions } from '#lib/getAuthTokenOptions';
import {
	DEFAULT_REFRESH_TOKEN_EXPIRES,
	DEFAULT_ACCESS_TOKEN_EXPIRES,
	DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
	DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
	getNodeEnvMode,
	authPath,
} from '#utils/constants';
import { env } from 'hono/adapter';

import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware';

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

		try {
			// Verify the refresh token
			const payload = await verify(refresh_token, REFRESH_TOKEN_SECRET);
			const id = Number(payload.id);
			const username = payload.username as string;
			const email_verified = payload.email_verified as boolean;
			const phone_verified = payload.phone_verified as boolean;

			const user = {
				id,
				username,
				email_verified,
				phone_verified,
			};

			const { db } = createClient();
			// Check if the refresh token exists in db
			const storedToken = await db.select().from(refreshTokens).where(eq(refreshTokens.username, username));

			// Token doesn't exist or doesn't match - possible reuse detected
			if (!storedToken || storedToken?.[0]?.token !== refresh_token) {
				await db.delete(refreshTokens).where(eq(refreshTokens.username, username));

				return c.json({ message: 'Invalid refresh token' }, 401);
			}

			const access_token_payload = tokenPayload({
				...user,
				exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS(),
			});

			const refresh_token_payload = tokenPayload({
				...user,
				exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS(),
			});

			// Generate and sign tokens
			const new_access_token = await sign(access_token_payload, ACCESS_TOKEN_SECRET);
			const new_refresh_token = await sign(refresh_token_payload, REFRESH_TOKEN_SECRET);

			setCookie(c, 'access_token', new_access_token, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: DEFAULT_ACCESS_TOKEN_EXPIRES(),
				}),
			});
			setCookie(c, 'refresh_token', new_refresh_token, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: DEFAULT_REFRESH_TOKEN_EXPIRES(),
				}),
			});

			// Store new refresh token in DB
			try {
				await db.insert(refreshTokens).values({
					username,
					token: new_refresh_token,
					expires_at: DEFAULT_REFRESH_TOKEN_EXPIRES(),
				});
			} catch (error) {
				console.error('Error storing refresh token in DB:', error);
				return c.json({ message: 'An error occurred during login' }, 500);
			}

			return c.json(
				{
					message: 'Tokens refreshed successfully',
					access_token: new_access_token,
					refresh_token: new_refresh_token,
				},
				200,
			);
		} catch (error) {
			console.error('Error refreshing tokens:', error);
			return c.json({ message: 'Error refreshing tokens' }, 500);
		}
	},
);
