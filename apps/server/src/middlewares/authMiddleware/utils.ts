import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';

import { getAuthTokenDeleteOptions, getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import { tokenPayload } from '../../lib/tokenPayload';
import { AppBindings } from '../../lib/types';
import { DEFAULT_ACCESS_TOKEN_EXPIRES } from '../../utils/constants';
import { DrizzleClient } from '../../database/index';
import { refreshTokens } from '../../database/schemas/refreshTokens';
import { users } from '../../database/schemas/users';
import { profiles } from '../../database/schemas/profiles';

export type RefreshTokenClaims = AppBindings['Variables']['user'] & {
	exp: number;
	jti?: string;
};

export async function verifyRefreshTokenClaims(token: string, secret: string): Promise<RefreshTokenClaims> {
	const payload = await verify(token, secret);
	const claims = {
		id: payload.id,
		profile_id: payload.profile_id,
		email: payload.email,
		username: payload.username,
		email_verified: payload.email_verified,
		phone_verified: payload.phone_verified,
		exp: payload.exp,
		jti: payload.jti,
	};

	if (
		!Number.isSafeInteger(claims.id) ||
		!Number.isSafeInteger(claims.profile_id) ||
		typeof claims.email !== 'string' ||
		claims.email.length === 0 ||
		typeof claims.username !== 'string' ||
		claims.username.length === 0 ||
		typeof claims.email_verified !== 'boolean' ||
		typeof claims.phone_verified !== 'boolean' ||
		typeof claims.exp !== 'number' ||
		!Number.isFinite(claims.exp) ||
		claims.exp * 1_000 <= Date.now() ||
		(claims.jti !== undefined && typeof claims.jti !== 'string')
	) {
		throw new Error('Invalid refresh token claims');
	}

	return claims as RefreshTokenClaims;
}

// Helper function to clean up and invalidate tokens
export async function invalidateTokens(c: Context<AppBindings>, db: DrizzleClient['db'], isProductionMode?: boolean) {
	const refresh_token = getCookie(c, 'refresh_token');

	if (refresh_token) {
		// Delete refresh token from database if it exists
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
	}

	// Remove cookies
	const deleteOptions = getAuthTokenDeleteOptions({ isProductionMode });
	deleteCookie(c, 'access_token', deleteOptions);
	deleteCookie(c, 'refresh_token', deleteOptions);
}

// Helper function to verify and get refresh token details
export async function validateRefreshToken(
	c: Context<AppBindings>,
	db: DrizzleClient['db'],
	refreshTokenSecret: string,
) {
	const refresh_token = getCookie(c, 'refresh_token');

	if (!refresh_token) {
		throw new Error('No refresh token');
	}

	let claims: RefreshTokenClaims;
	try {
		claims = await verifyRefreshTokenClaims(refresh_token, refreshTokenSecret);
	} catch (error) {
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
		throw error;
	}

	const storedRefreshToken = await db.query.refreshTokens.findFirst({ where: { token: refresh_token } });

	if (
		!storedRefreshToken ||
		storedRefreshToken.expires_at.getTime() <= Date.now() ||
		storedRefreshToken.username !== claims.username
	) {
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refresh_token));
		throw new Error('Invalid refresh token');
	}

	return { claims, storedRefreshToken };
}

// Helper function to create a new access token
export async function createNewAccessToken(
	c: Context<AppBindings>,
	db: DrizzleClient['db'],
	claims: RefreshTokenClaims,
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
			is_banned: users.is_banned,
		})
		.from(users)
		.innerJoin(profiles, eq(users.id, profiles.user_id))
		.where(eq(users.id, claims.id))
		.limit(1);

	if (
		!existingUser ||
		existingUser.is_banned ||
		existingUser.username !== claims.username ||
		existingUser.profile_id !== claims.profile_id
	) {
		throw new Error('User not found');
	}
	const accessTokenExpires = DEFAULT_ACCESS_TOKEN_EXPIRES();

	const access_token_payload = tokenPayload({
		id: existingUser.id,
		profile_id: existingUser.profile_id,
		email: existingUser.email,
		username: existingUser.username,
		email_verified: existingUser.email_verified,
		phone_verified: existingUser.phone_verified,
		exp: Math.floor(accessTokenExpires.getTime() / 1_000),
	});

	const new_access_token = await sign({ ...access_token_payload, jti: randomUUID() }, ACCESS_TOKEN_SECRET);

	// Set the new access token in cookies
	setCookie(c, 'access_token', new_access_token, {
		...getAuthTokenOptions({
			isProductionMode,
			expires: accessTokenExpires,
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
