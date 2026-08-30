import { randomUUID } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import { getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { describeRoute } from 'hono-openapi';
import { env } from 'hono/adapter';

import { createClient } from '../../database/index';
import { refreshTokens } from '../../database/schemas/schema';
import { tokenPayload } from '../../lib/tokenPayload';
import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import {
	DEFAULT_REFRESH_TOKEN_EXPIRES,
	DEFAULT_ACCESS_TOKEN_EXPIRES,
	DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
	DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
	getNodeEnvMode,
	authPath,
} from '../../utils/constants';
import { createRouter } from '../../lib/create-app';
import { authMiddleware } from '../../middlewares/authMiddleware/index';

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

		let payload;
		try {
			payload = await verify(refresh_token, REFRESH_TOKEN_SECRET);
		} catch {
			return c.json({ message: 'Invalid refresh token' }, 401);
		}

		try {
			const id = Number(payload.id);
			const profile_id = Number(payload.profile_id);
			const username = payload.username as string;
			const email = payload.email as string;
			const email_verified = payload.email_verified as boolean;
			const phone_verified = payload.phone_verified as boolean;

			const user = {
				id,
				profile_id,
				username,
				email,
				email_verified,
				phone_verified,
			};

			const access_token_payload = tokenPayload({
				...user,
				exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS(),
			});

			const refresh_token_payload = tokenPayload({
				...user,
				exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS(),
			});

			// Generate and sign tokens
			const new_access_token = await sign({ ...access_token_payload, jti: randomUUID() }, ACCESS_TOKEN_SECRET);
			const new_refresh_token = await sign({ ...refresh_token_payload, jti: randomUUID() }, REFRESH_TOKEN_SECRET);
			const { db } = createClient();
			const rotated = await db.transaction(async (tx) => {
				const [consumedToken] = await tx
					.delete(refreshTokens)
					.where(and(eq(refreshTokens.token, refresh_token), gt(refreshTokens.expires_at, new Date())))
					.returning();

				if (!consumedToken || consumedToken.username !== username) {
					await tx.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
					return false;
				}

				await tx.insert(refreshTokens).values({
					username,
					token: new_refresh_token,
					expires_at: DEFAULT_REFRESH_TOKEN_EXPIRES(),
				});
				return true;
			});

			if (!rotated) {
				return c.json({ message: 'Invalid refresh token' }, 401);
			}

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

			return c.json(
				{
					message: 'Tokens refreshed successfully',
					access_token: new_access_token,
					refresh_token: new_refresh_token,
				},
				200,
			);
		} catch {
			return c.json({ message: 'Error refreshing tokens' }, 500);
		}
	},
);
