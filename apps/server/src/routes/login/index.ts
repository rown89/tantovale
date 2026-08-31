import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { setCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';

import { tokenPayload } from '../../lib/tokenPayload';
import { verifyPassword } from '../../lib/password';
import { createClient } from '../../database';
import { users, refreshTokens, profiles } from '../../database/schemas/schema';
import { DEFAULT_ACCESS_TOKEN_EXPIRES, DEFAULT_REFRESH_TOKEN_EXPIRES, getNodeEnvMode } from '../../utils/constants';
import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import { createRouter } from '../../lib/create-app';
import { acquireUserTransactionLock } from '../../lib/user-transaction-lock';
import { UserProfileSchema } from '../../extended_schemas/users';

const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const loginSchema = UserProfileSchema.pick({ email: true }).extend({
	// Keep accepting the legacy character range: existing bcrypt hashes may have been created from >72-byte input.
	password: z.string().min(8, 'La password deve contenere almeno 8 caratteri').max(100).nonempty(),
});

export const loginRoute = createRouter().post('/', zValidator('json', loginSchema), async (c) => {
	const { NODE_ENV, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = env<{
		NODE_ENV: string;
		ACCESS_TOKEN_SECRET: string;
		REFRESH_TOKEN_SECRET: string;
	}>(c);

	const { isProductionMode } = getNodeEnvMode(NODE_ENV);

	try {
		const { email, password } = c.req.valid('json');

		const { db } = createClient();

		// Preserve a dummy bcrypt check for unknown accounts and avoid locking unrelated user ids.
		const [candidate] = await db
			.select({
				id: users.id,
				password: users.password,
			})
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		const preliminaryPasswordMatch = await verifyPassword(candidate?.password ?? DUMMY_PASSWORD_HASH, password);

		if (!candidate || !preliminaryPasswordMatch) {
			return c.json({ message: 'invalid email or password' }, 401);
		}

		const session = await db.transaction(async (tx) => {
			await acquireUserTransactionLock(tx, candidate.id);
			const [currentUser] = await tx
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
				.where(and(eq(users.id, candidate.id), eq(users.email, email)))
				.limit(1);

			const currentPasswordMatch = await verifyPassword(currentUser?.password ?? DUMMY_PASSWORD_HASH, password);
			if (!currentUser || !currentPasswordMatch) {
				return { outcome: 'invalid' as const };
			}
			if (!currentUser.email_verified) {
				return { outcome: 'unverified' as const };
			}
			if (currentUser.is_banned) {
				return { outcome: 'banned' as const };
			}

			const accessTokenExpires = DEFAULT_ACCESS_TOKEN_EXPIRES();
			const refreshTokenExpires = DEFAULT_REFRESH_TOKEN_EXPIRES();
			const accessTokenPayload = tokenPayload({
				id: currentUser.id,
				profile_id: currentUser.profile_id,
				username: currentUser.username,
				email: currentUser.email,
				email_verified: currentUser.email_verified,
				phone_verified: currentUser.phone_verified,
				exp: Math.floor(accessTokenExpires.getTime() / 1_000),
			});
			const refreshTokenPayload = tokenPayload({
				id: currentUser.id,
				profile_id: currentUser.profile_id,
				username: currentUser.username,
				email: currentUser.email,
				email_verified: currentUser.email_verified,
				phone_verified: currentUser.phone_verified,
				exp: Math.floor(refreshTokenExpires.getTime() / 1_000),
			});
			const accessToken = await sign({ ...accessTokenPayload, jti: randomUUID() }, ACCESS_TOKEN_SECRET);
			const refreshToken = await sign(
				{ ...refreshTokenPayload, jti: randomUUID(), sid: randomUUID() },
				REFRESH_TOKEN_SECRET,
			);
			const [persistedSession] = await tx
				.insert(refreshTokens)
				.values({
					username: currentUser.username,
					token: refreshToken,
					expires_at: refreshTokenExpires,
				})
				.returning({ id: refreshTokens.id });

			if (!persistedSession) {
				throw new Error('Login session was not persisted');
			}

			return {
				outcome: 'success' as const,
				user: currentUser,
				accessToken,
				refreshToken,
				accessTokenExpires,
				refreshTokenExpires,
				accessTokenPayload,
			};
		});

		if (session.outcome === 'invalid') {
			return c.json({ message: 'invalid email or password' }, 401);
		}
		if (session.outcome === 'unverified') {
			return c.json({ message: 'Please verify your email before logging in' }, 403);
		}
		if (session.outcome === 'banned') {
			return c.json({ message: 'Account is banned' }, 403);
		}

		setCookie(c, 'access_token', session.accessToken, {
			...getAuthTokenOptions({
				isProductionMode,
				expires: session.accessTokenExpires,
			}),
		});

		setCookie(c, 'refresh_token', session.refreshToken, {
			...getAuthTokenOptions({
				isProductionMode,
				expires: session.refreshTokenExpires,
			}),
		});

		return c.json(
			{
				message: 'login successful',
				user: {
					id: session.user.id,
					profile_id: session.user.profile_id,
					username: session.user.username,
					email: session.user.email,
					email_verified: session.user.email_verified,
					phone_verified: session.user.phone_verified,
					exp: session.accessTokenPayload.exp,
				},
			},
			200,
		);
	} catch {
		return c.json({ message: 'Internal server error' }, 500);
	}
});
