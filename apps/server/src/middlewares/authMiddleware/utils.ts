import { randomUUID } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';

import type { DrizzleClient } from '../../database/index';
import { profiles } from '../../database/schemas/profiles';
import { refreshTokens } from '../../database/schemas/refreshTokens';
import { users } from '../../database/schemas/users';
import { getAuthTokenDeleteOptions, getAuthTokenOptions } from '../../lib/getAuthTokenOptions';
import { tokenPayload } from '../../lib/tokenPayload';
import type { AppBindings, User } from '../../lib/types';
import { DEFAULT_ACCESS_TOKEN_EXPIRES, DEFAULT_REFRESH_TOKEN_EXPIRES } from '../../utils/constants';

export type AuthTokenClaims = User & {
	exp: number;
	jti?: string;
};

export class InvalidRefreshSessionError extends Error {
	constructor() {
		super('Invalid refresh session');
	}
}

function validateAuthTokenClaims(payload: Awaited<ReturnType<typeof verify>>): AuthTokenClaims {
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
		(claims.jti !== undefined && (typeof claims.jti !== 'string' || claims.jti.length === 0))
	) {
		throw new Error('Invalid authentication token claims');
	}

	return claims as AuthTokenClaims;
}

export async function verifyAccessTokenClaims(token: string, secret: string): Promise<AuthTokenClaims> {
	return validateAuthTokenClaims(await verify(token, secret));
}

export async function verifyRefreshTokenClaims(token: string, secret: string): Promise<AuthTokenClaims> {
	return validateAuthTokenClaims(await verify(token, secret));
}

export async function invalidateTokens(c: Context<AppBindings>, db: DrizzleClient['db'], isProductionMode?: boolean) {
	const refreshToken = getCookie(c, 'refresh_token');

	if (refreshToken) {
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
	}

	const deleteOptions = getAuthTokenDeleteOptions({ isProductionMode });
	deleteCookie(c, 'access_token', deleteOptions);
	deleteCookie(c, 'refresh_token', deleteOptions);
}

type RotateRefreshSessionOptions = {
	c: Context<AppBindings>;
	db: DrizzleClient['db'];
	refreshToken: string;
	accessTokenSecret: string;
	refreshTokenSecret: string;
	isProductionMode: boolean;
};

export async function rotateRefreshSession({
	c,
	db,
	refreshToken,
	accessTokenSecret,
	refreshTokenSecret,
	isProductionMode,
}: RotateRefreshSessionOptions): Promise<User> {
	let claims: AuthTokenClaims;
	try {
		claims = await verifyRefreshTokenClaims(refreshToken, refreshTokenSecret);
	} catch {
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
		throw new InvalidRefreshSessionError();
	}

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
		await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
		throw new InvalidRefreshSessionError();
	}

	const user: User = {
		id: existingUser.id,
		profile_id: existingUser.profile_id,
		email: existingUser.email,
		username: existingUser.username,
		email_verified: existingUser.email_verified,
		phone_verified: existingUser.phone_verified,
	};
	const accessTokenExpires = DEFAULT_ACCESS_TOKEN_EXPIRES();
	const refreshTokenExpires = DEFAULT_REFRESH_TOKEN_EXPIRES();
	const accessToken = await sign(
		{
			...tokenPayload({ ...user, exp: Math.floor(accessTokenExpires.getTime() / 1_000) }),
			jti: randomUUID(),
		},
		accessTokenSecret,
	);
	const replacementRefreshToken = await sign(
		{
			...tokenPayload({ ...user, exp: Math.floor(refreshTokenExpires.getTime() / 1_000) }),
			jti: randomUUID(),
		},
		refreshTokenSecret,
	);

	const rotated = await db.transaction(async (tx) => {
		const [consumedToken] = await tx
			.delete(refreshTokens)
			.where(and(eq(refreshTokens.token, refreshToken), gt(refreshTokens.expires_at, new Date())))
			.returning();

		if (
			!consumedToken ||
			consumedToken.username !== claims.username ||
			consumedToken.username !== existingUser.username
		) {
			await tx.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
			return false;
		}

		await tx.insert(refreshTokens).values({
			username: existingUser.username,
			token: replacementRefreshToken,
			expires_at: refreshTokenExpires,
		});
		return true;
	});

	if (!rotated) {
		throw new InvalidRefreshSessionError();
	}

	setCookie(c, 'access_token', accessToken, {
		...getAuthTokenOptions({ isProductionMode, expires: accessTokenExpires }),
	});
	setCookie(c, 'refresh_token', replacementRefreshToken, {
		...getAuthTokenOptions({ isProductionMode, expires: refreshTokenExpires }),
	});
	c.set('user', user);

	return user;
}
