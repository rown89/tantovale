import { eq } from 'drizzle-orm';
import { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';

import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import { tokenPayload } from '../../lib/tokenPayload';
import { AppBindings } from '../../lib/types';
import { DEFAULT_ACCESS_TOKEN_EXPIRES, DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS } from '../../utils/constants';
import { DrizzleClient } from '../../database/index';
import { refreshTokens } from '../../database/schemas/refreshTokens';
import { users } from '../../database/schemas/users';
import { profiles } from '../../database/schemas/profiles';

// Helper function to clean up and invalidate tokens
export async function invalidateTokens(c: Context<AppBindings>, db: DrizzleClient['db']) {
	const refresh_token = getCookie(c, 'refresh_token');

	if (refresh_token) {
		// Delete refresh token from database if it exists
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
	}

	// Remove cookies
	deleteCookie(c, 'access_token');
	deleteCookie(c, 'refresh_token');
}

// Helper function to verify and get refresh token details
export async function validateRefreshToken(c: Context<AppBindings>, db: DrizzleClient['db']) {
	const refresh_token = getCookie(c, 'refresh_token');

	if (!refresh_token) {
		throw new Error('No refresh token');
	}

	const storedRefreshToken = await db.query.refreshTokens.findFirst({
		where: eq(refreshTokens.token, refresh_token),
	});

	if (!storedRefreshToken) {
		throw new Error('Invalid refresh token');
	}

	const refreshTokenExpiry = new Date(storedRefreshToken.expires_at);
	if (refreshTokenExpiry < new Date()) {
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
		throw new Error('Refresh token expired');
	}

	return storedRefreshToken;
}

// Helper function to create a new access token
export async function createNewAccessToken(
	c: Context<AppBindings>,
	db: DrizzleClient['db'],
	username: string,
	ACCESS_TOKEN_SECRET: string,
	isProductionMode: boolean,
) {
	const [existingUser] = await db
		.select({
			id: users.id,
			email: users.email,
			username: users.username,
			email_verified: users.email_verified,
			phone_verified: users.phone_verified,
			profile_id: profiles.id,
		})
		.from(users)
		.innerJoin(profiles, eq(users.id, profiles.user_id))
		.where(eq(users.username, username))
		.limit(1);

	if (!existingUser) {
		throw new Error('User not found');
	}

	const access_token_payload = tokenPayload({
		id: existingUser.id,
		profile_id: existingUser.profile_id,
		email: existingUser.email,
		username: existingUser.username,
		email_verified: existingUser.email_verified,
		phone_verified: existingUser.phone_verified,
		exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS(),
	});

	const new_access_token = await sign(access_token_payload, ACCESS_TOKEN_SECRET);

	// Set the new access token in cookies
	setCookie(c, 'access_token', new_access_token, {
		...getAuthTokenOptions({
			isProductionMode,
			expires: DEFAULT_ACCESS_TOKEN_EXPIRES(),
		}),
	});

	return {
		user: {
			id: existingUser.id,
			profile_id: existingUser.profile_id,
			email: existingUser.email,
			username: existingUser.username,
			email_verified: existingUser.email_verified,
			phone_verified: existingUser.phone_verified,
		},
		payload: access_token_payload,
	};
}
