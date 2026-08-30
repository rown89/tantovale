import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { setCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { zValidator } from '@hono/zod-validator';

import { tokenPayload } from '../../lib/tokenPayload';
import { verifyPassword } from '../../lib/password';
import { createClient } from '../../database';
import { users, refreshTokens, profiles } from '../../database/schemas/schema';
import { DEFAULT_ACCESS_TOKEN_EXPIRES, DEFAULT_REFRESH_TOKEN_EXPIRES, getNodeEnvMode } from '../../utils/constants';
import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import { createRouter } from '../../lib/create-app';
import { UserProfileSchema } from '../../extended_schemas/users';

const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const loginRoute = createRouter().post(
	'/',
	zValidator(
		'json',
		UserProfileSchema.pick({
			email: true,
			password: true,
		}),
	),
	async (c) => {
		const { NODE_ENV, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = env<{
			NODE_ENV: string;
			ACCESS_TOKEN_SECRET: string;
			REFRESH_TOKEN_SECRET: string;
		}>(c);

		const { isProductionMode } = getNodeEnvMode(NODE_ENV);

		try {
			const { email, password } = c.req.valid('json');

			const { db } = createClient();

			// lookup email in database
			const [user] = await db
				.select({
					id: users.id,
					profile_id: profiles.id,
					username: users.username,
					email: users.email,
					email_verified: users.email_verified,
					phone_verified: users.phone_verified,
					password: users.password,
					is_banned: users.is_banned,
				})
				.from(users)
				.innerJoin(profiles, eq(users.id, profiles.user_id))
				.where(eq(users.email, email))
				.limit(1);

			const verifyResult = await verifyPassword(user?.password ?? DUMMY_PASSWORD_HASH, password);

			if (!user || !verifyResult) {
				return c.json({ message: 'invalid email or password' }, 401);
			}

			const { id, profile_id, username, email_verified, phone_verified } = user;

			if (!email_verified) {
				return c.json({ message: 'Please verify your email before logging in' }, 403);
			}
			if (user.is_banned) {
				return c.json({ message: 'Account is banned' }, 403);
			}

			const accessTokenExpires = DEFAULT_ACCESS_TOKEN_EXPIRES();
			const refreshTokenExpires = DEFAULT_REFRESH_TOKEN_EXPIRES();

			const access_token_payload = tokenPayload({
				id,
				profile_id,
				username,
				email,
				email_verified,
				phone_verified,
				exp: Math.floor(accessTokenExpires.getTime() / 1_000),
			});

			const refresh_token_payload = tokenPayload({
				id,
				profile_id,
				username,
				email,
				email_verified,
				phone_verified,
				exp: Math.floor(refreshTokenExpires.getTime() / 1_000),
			});

			// Generate and sign tokens
			const access_token = await sign({ ...access_token_payload, jti: randomUUID() }, ACCESS_TOKEN_SECRET);
			const refresh_token = await sign({ ...refresh_token_payload, jti: randomUUID() }, REFRESH_TOKEN_SECRET);

			const newRefreshToken = await db
				.insert(refreshTokens)
				.values({
					username: user.username,
					token: refresh_token,
					expires_at: refreshTokenExpires,
				})
				.returning();

			if (!newRefreshToken.length) {
				return c.json({ message: 'An error occurred during login' }, 500);
			}

			setCookie(c, 'access_token', access_token, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: accessTokenExpires,
				}),
			});

			setCookie(c, 'refresh_token', refresh_token, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: refreshTokenExpires,
				}),
			});

			return c.json(
				{
					message: 'login successful',
					user: {
						id,
						profile_id,
						username,
						email: email,
						email_verified,
						phone_verified,
						exp: access_token_payload.exp,
					},
				},
				200,
			);
		} catch {
			return c.json({ message: 'Internal server error' }, 500);
		}
	},
);
