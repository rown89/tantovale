import { env } from 'hono/adapter';
import { getCookie } from 'hono/cookie';
import { describeRoute } from 'hono-openapi';

import { createClient } from '../../database';
import { createRouter } from '../../lib/create-app';
import { InvalidRefreshSessionError, rotateRefreshSession } from '../../middlewares/authMiddleware/utils';
import { authPath, getNodeEnvMode } from '../../utils/constants';

export const refreshRoute = createRouter().post(
	`/${authPath}`,
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
		const refreshToken = getCookie(c, 'refresh_token');

		if (!refreshToken) {
			return c.json({ message: 'No refresh token provided' }, 401);
		}

		try {
			await rotateRefreshSession({
				c,
				db: createClient().db,
				refreshToken,
				accessTokenSecret: ACCESS_TOKEN_SECRET,
				refreshTokenSecret: REFRESH_TOKEN_SECRET,
				isProductionMode: getNodeEnvMode(NODE_ENV).isProductionMode,
			});
			return c.json({ message: 'Tokens refreshed successfully' }, 200);
		} catch (error) {
			if (error instanceof InvalidRefreshSessionError) {
				return c.json({ message: 'Invalid refresh token' }, 401);
			}
			return c.json({ message: 'Error refreshing tokens' }, 500);
		}
	},
);
