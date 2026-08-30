import { randomUUID } from 'node:crypto';

import { sign, verify } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { setCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { describeRoute } from 'hono-openapi';

import { tokenPayload } from '../../lib/tokenPayload';
import { DEFAULT_ACCESS_TOKEN_EXPIRES, DEFAULT_REFRESH_TOKEN_EXPIRES, getNodeEnvMode } from '../../utils/constants';
import { createClient } from '../../database';
import { profiles, refreshTokens, users } from '../../database/schemas/schema';

import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import { createRouter } from '../../lib/create-app';
import { hasLiveMatchingRefreshSession, verifyAccessTokenClaims } from '../../middlewares/authMiddleware/utils';

export const verifyRoute = createRouter()
	.get(
		'/',
		describeRoute({
			description: 'User token verifier',
			responses: {
				200: {
					description: 'Token verified successfully',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									message: { type: 'string' },
									user: {
										type: 'object',
										properties: {
											id: { type: 'number' },
											username: { type: 'string' },
											email: { type: 'string' },
											email_verified: { type: 'boolean' },
											phone_verified: { type: 'boolean' },
										},
									},
								},
							},
						},
					},
				},
				401: {
					description: 'No token provided or invalid token',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									message: { type: 'string' },
								},
							},
						},
					},
				},
				500: {
					description: 'Error processing request',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									message: { type: 'string' },
								},
							},
						},
					},
				},
			},
		}),
		async (c) => {
			const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = env<{
				ACCESS_TOKEN_SECRET: string;
				REFRESH_TOKEN_SECRET: string;
			}>(c);

			const accessToken = getCookie(c, 'access_token');
			const refreshToken = getCookie(c, 'refresh_token');
			if (!accessToken || !refreshToken) {
				return c.json({ message: 'No token provided' }, 401);
			}

			let claims;
			try {
				claims = await verifyAccessTokenClaims(accessToken, ACCESS_TOKEN_SECRET);
			} catch {
				return c.json({ message: 'Invalid token' }, 401);
			}

			try {
				const { db } = createClient();
				const [user] = await db
					.select({
						id: users.id,
						profile_id: profiles.id,
						username: users.username,
						email: users.email,
						email_verified: users.email_verified,
						phone_verified: users.phone_verified,
						is_banned: users.is_banned,
					})
					.from(users)
					.innerJoin(profiles, eq(users.id, profiles.user_id))
					.where(eq(users.id, claims.id))
					.limit(1);

				if (
					!user ||
					user.is_banned ||
					!(await hasLiveMatchingRefreshSession({
						db,
						refreshToken,
						refreshTokenSecret: REFRESH_TOKEN_SECRET,
						accessClaims: claims,
						user,
					}))
				) {
					return c.json({ message: 'Invalid token' }, 401);
				}

				return c.json(
					{
						message: 'Token verified successfully',
						user: {
							id: user.id,
							profile_id: user.profile_id,
							username: user.username,
							email: user.email,
							email_verified: user.email_verified,
							phone_verified: user.phone_verified,
							exp: claims.exp,
						},
					},
					200,
				);
			} catch {
				return c.json({ message: 'Error processing verify token request' }, 500);
			}
		},
	)
	.get(
		'/email',
		describeRoute({
			description: 'Email verifier',
			responses: {
				200: {
					description: 'Email verified successfully!',
				},
			},
		}),
		async (c) => {
			const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, EMAIL_VERIFY_TOKEN_SECRET, NODE_ENV } = env<{
				ACCESS_TOKEN_SECRET: string;
				REFRESH_TOKEN_SECRET: string;
				EMAIL_VERIFY_TOKEN_SECRET: string;
				NODE_ENV: string;
			}>(c);

			const { isProductionMode } = getNodeEnvMode(NODE_ENV);

			const token = c.req.query('token');
			if (!token) return c.json({ error: 'Token required' }, 400);

			let tokenClaims;
			try {
				tokenClaims = await verify(token, EMAIL_VERIFY_TOKEN_SECRET);
			} catch {
				return c.json({ message: 'Invalid token' }, 400);
			}

			if (
				!Number.isSafeInteger(tokenClaims.id) ||
				typeof tokenClaims.username !== 'string' ||
				tokenClaims.username.length === 0 ||
				tokenClaims.type !== 'email_verification' ||
				typeof tokenClaims.exp !== 'number' ||
				!Number.isFinite(tokenClaims.exp) ||
				tokenClaims.exp * 1_000 <= Date.now()
			) {
				return c.json({ message: 'Invalid token' }, 400);
			}

			try {
				const { db } = createClient();
				const [user] = await db
					.select({
						id: users.id,
						profile_id: profiles.id,
						username: users.username,
						email: users.email,
						email_verified: users.email_verified,
						phone_verified: users.phone_verified,
					})
					.from(users)
					.innerJoin(profiles, eq(users.id, profiles.user_id))
					.where(eq(users.id, tokenClaims.id as number))
					.limit(1);

				if (!user) {
					return c.json({ error: 'User not found' }, 404);
				}
				if (user.username !== tokenClaims.username) {
					return c.json({ message: 'Invalid token' }, 400);
				}

				if (user.email_verified) {
					return c.json({ message: 'User already verified' });
				}

				const verifiedUser = { ...user, email_verified: true };
				const accessTokenExpires = DEFAULT_ACCESS_TOKEN_EXPIRES();
				const refreshTokenExpires = DEFAULT_REFRESH_TOKEN_EXPIRES();
				const access_token_payload = tokenPayload({
					...verifiedUser,
					exp: Math.floor(accessTokenExpires.getTime() / 1_000),
				});
				const refresh_token_payload = tokenPayload({
					...verifiedUser,
					exp: Math.floor(refreshTokenExpires.getTime() / 1_000),
				});
				const new_access_token = await sign({ ...access_token_payload, jti: randomUUID() }, ACCESS_TOKEN_SECRET);
				const new_refresh_token = await sign({ ...refresh_token_payload, jti: randomUUID() }, REFRESH_TOKEN_SECRET);

				await db.transaction(async (tx) => {
					await tx.update(users).set({ email_verified: true }).where(eq(users.id, user.id));
					await tx.insert(refreshTokens).values({
						username: user.username,
						token: new_refresh_token,
						expires_at: refreshTokenExpires,
					});
				});

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

				return c.json({ message: 'Email verified successfully!' }, 200);
			} catch {
				return c.json({ message: 'Email verification failed' }, 500);
			}
		},
	);
