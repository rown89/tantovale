import { sign, verify } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { setCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { describeRoute } from 'hono-openapi';

import { tokenPayload } from '../../lib/tokenPayload';
import {
	DEFAULT_ACCESS_TOKEN_EXPIRES,
	DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
	DEFAULT_REFRESH_TOKEN_EXPIRES,
	DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
	getNodeEnvMode,
} from '../../utils/constants';
import { createClient } from '../../database';
import { refreshTokens, users } from '../../database/schemas/schema';

import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import { createRouter } from '../../lib/create-app';

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
			const { ACCESS_TOKEN_SECRET } = env<{
				ACCESS_TOKEN_SECRET: string;
			}>(c);

			try {
				// Get the signed access token from cookies
				const accessToken = getCookie(c, 'access_token');

				if (!accessToken) {
					return c.json({ message: 'No token provided' }, 401);
				}

				// Verify and decode the token
				try {
					const payload = await verify(accessToken, ACCESS_TOKEN_SECRET);

					if (!payload) return c.json({ message: 'Invalid token' }, 401);

					return c.json(
						{
							message: 'Token verified successfully',
							user: {
								id: payload.id as number,
								username: payload.username as string,
								email_verified: payload.email_verified as boolean,
								phone_verified: payload.phone_verified as boolean,
							},
						},
						200,
					);
				} catch (tokenError) {
					// Specific handling for token verification errors
					console.error('Token verification failed:', tokenError);
					return c.json({ message: 'Invalid token' }, 401);
				}
			} catch (err) {
				console.error('Error processing verify token request: ', err);
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

			const { isProductionMode, isStagingMode } = getNodeEnvMode(NODE_ENV);

			const token = c.req.query('token');
			if (!token) return c.json({ error: 'Token required' }, 409);

			const { id, type } = await verify(token, EMAIL_VERIFY_TOKEN_SECRET);

			const { db } = createClient();
			// Get existing user by id
			const user = await db.query.users.findFirst({
				where: (tbl) => eq(tbl.id, Number(id)),
			});

			if (!user) {
				return c.json({ error: 'User not found' }, 404);
			}

			const { id: userId, username, email_verified, phone_verified } = user;

			if (user.email_verified) {
				return c.json({ message: 'User already verified' });
			}

			if (type != 'email_verification') {
				return c.json({ message: 'Invalid token type' });
			}

			await db
				.update(users)
				.set({
					email_verified: true,
				})
				.where(eq(users.id, user.id));

			const access_token_payload = tokenPayload({
				id: userId,
				username,
				email_verified,
				phone_verified,
				exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS(),
			});

			const refresh_token_payload = tokenPayload({
				id: userId,
				username,
				email_verified,
				phone_verified,
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

			// Store refresh token in DB
			const updatedUser = await db
				.insert(refreshTokens)
				.values({
					username,
					token: new_refresh_token,
					expires_at: DEFAULT_REFRESH_TOKEN_EXPIRES(),
				})
				.returning();

			if (!updatedUser || !updatedUser.length) {
				return c.json(
					{
						message: "An error occurred, can't update the refresh token during login",
					},
					500,
				);
			}

			return c.json(
				{
					message: 'Email verified successfully!',
				},
				200,
			);
		},
	);
