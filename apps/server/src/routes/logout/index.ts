import { deleteCookie, getCookie } from 'hono/cookie';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { env } from 'hono/adapter';
import { describeRoute } from 'hono-openapi';

import { createClient } from '../../database';
import { profiles, refreshTokens, users } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { getAuthTokenDeleteOptions } from '../../lib/getAuthTokenOptions';
import { acquireUserTransactionLock } from '../../lib/user-transaction-lock';
import { getRefreshSessionFamilyId, verifyRefreshTokenClaims } from '../../middlewares/authMiddleware/utils';
import { authPath, getNodeEnvMode } from '../../utils/constants';
import { authenticationOpenApi } from '../../openapi/routes';

export const logoutRoute = createRouter().post(
	`/${authPath}`,
	describeRoute(authenticationOpenApi.logout),
	async (c) => {
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
	let claims: Awaited<ReturnType<typeof verifyRefreshTokenClaims>>;
	try {
		claims = await verifyRefreshTokenClaims(refreshToken, REFRESH_TOKEN_SECRET);
	} catch {
		try {
			await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
		} catch {
			// Cookies are still cleared locally when session revocation storage is unavailable.
		}
		return c.json({ message: 'Logout error' }, 401);
	}

	try {
		const revoked = await db.transaction(async (tx) => {
			await acquireUserTransactionLock(tx, claims.id);
			const [currentUser] = await tx
				.select({ id: users.id, profileId: profiles.id, username: users.username })
				.from(users)
				.innerJoin(profiles, eq(users.id, profiles.user_id))
				.where(eq(users.id, claims.id))
				.limit(1);

			if (!currentUser || currentUser.profileId !== claims.profile_id || currentUser.username !== claims.username) {
				return false;
			}

			const familyId = getRefreshSessionFamilyId(claims);
			const liveSessions = await tx
				.select({ token: refreshTokens.token })
				.from(refreshTokens)
				.where(and(eq(refreshTokens.username, claims.username), gt(refreshTokens.expires_at, new Date())));
			const matchingTokens: string[] = [];
			for (const session of liveSessions) {
				try {
					const sessionClaims = await verifyRefreshTokenClaims(session.token, REFRESH_TOKEN_SECRET);
					if (
						sessionClaims.id === claims.id &&
						sessionClaims.profile_id === claims.profile_id &&
						sessionClaims.username === claims.username &&
						getRefreshSessionFamilyId(sessionClaims) === familyId
					) {
						matchingTokens.push(session.token);
					}
				} catch {
					// A malformed row cannot prove membership in the presented signed session family.
				}
			}

			if (matchingTokens.length === 0) return false;
			const revokedSessions = await tx
				.delete(refreshTokens)
				.where(inArray(refreshTokens.token, matchingTokens))
				.returning({ token: refreshTokens.token });
			return revokedSessions.length === matchingTokens.length;
		});

		return revoked ? c.json({ message: 'Logout successful' }, 200) : c.json({ message: 'Logout error' }, 401);
	} catch {
		return c.json({ message: 'Logout error' }, 401);
	}
	},
);
