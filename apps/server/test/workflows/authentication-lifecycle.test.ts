import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';

import { app } from '../../src/app';
import { password_reset_tokens, profiles, refreshTokens, users } from '../../src/database/schemas/schema';
import { uniqueValue } from '../fixtures/factories';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { extractTokenFromLink, waitForEmail } from '../helpers/mailpit';
import { captureCookies, CookieJar, jsonRequest } from '../helpers/request';

function requiredCookie(jar: CookieJar, name: string): string {
	const value = jar
		.header()
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name}=`))
		?.slice(name.length + 1);

	if (!value) {
		throw new Error(`Missing ${name} cookie`);
	}

	return value;
}

function hasCookie(jar: CookieJar, name: string): boolean {
	return jar
		.header()
		.split(';')
		.map((part) => part.trim())
		.some((part) => part.startsWith(`${name}=`));
}

function expectJsonResponse(response: Response, status: number): void {
	expect(response.status).toBe(status);
	expect(response.headers.get('content-type')).toMatch(/^application\/json\b/i);
}

function expectAuthCookiesCleared(response: Response): void {
	const setCookies = response.headers.getSetCookie();
	expect(setCookies.some((header) => /^access_token=;.*Max-Age=0/i.test(header))).toBe(true);
	expect(setCookies.some((header) => /^refresh_token=;.*Max-Age=0/i.test(header))).toBe(true);
}

it('proves the complete authentication lifecycle through emailed links and real cookies', async () => {
	const suffix = uniqueValue('auth-lifecycle');
	const credentials = {
		username: suffix,
		email: `${suffix}@tantovale.test`,
		password: 'StrongPass123!',
		name: 'Mario',
		surname: 'Rossi',
		gender: 'male' as const,
		privacy_policy: true as const,
		marketing_policy: false,
	};
	const replacementPassword = 'ReplacementPass456!';
	const { db } = getTestDatabase();
	const session = new CookieJar();

	const signupResponse = await app.request('/signup', jsonRequest('POST', credentials));
	captureCookies(signupResponse, session);

	expectJsonResponse(signupResponse, 201);
	expect(await signupResponse.json()).toEqual({ message: 'Successful Signup' });
	expect(await db.select({ id: users.id }).from(users)).toHaveLength(1);
	expect(await db.select({ id: profiles.id }).from(profiles)).toHaveLength(1);

	const verificationEmail = await waitForEmail(credentials.email, 'Attivazione account');
	const verificationToken = extractTokenFromLink(`${verificationEmail.HTML} ${verificationEmail.Text}`, 'token');
	expect(requiredCookie(session, 'email_activation_token') === verificationToken).toBe(true);

	const verificationResponse = await authenticatedRequest(
		`/verify/email?token=${encodeURIComponent(verificationToken)}`,
		'GET',
		session,
	);

	expectJsonResponse(verificationResponse, 200);
	expect(await verificationResponse.json()).toEqual({ message: 'Email verified successfully!' });
	expect(hasCookie(session, 'email_activation_token')).toBe(false);
	const initialAccessCookie = requiredCookie(session, 'access_token');
	const initialRefreshCookie = requiredCookie(session, 'refresh_token');

	const accessVerification = await authenticatedRequest('/verify', 'GET', session);
	expectJsonResponse(accessVerification, 200);
	const accessVerificationBody = (await accessVerification.json()) as {
		message: string;
		user: { email: string; email_verified: boolean; username: string };
	};
	expect(accessVerificationBody).toMatchObject({
		message: 'Token verified successfully',
		user: {
			email: credentials.email,
			email_verified: true,
			username: credentials.username,
		},
	});

	const userResponse = await authenticatedRequest('/user/auth', 'GET', session);
	expectJsonResponse(userResponse, 200);
	const authenticatedUser = (await userResponse.json()) as {
		id: number;
		profile_id: number;
		username: string;
		email: string;
		email_verified: boolean;
		phone_verified: boolean;
	};
	expect(authenticatedUser).toMatchObject({
		username: credentials.username,
		email: credentials.email,
		email_verified: true,
		phone_verified: false,
	});

	const initialSessions = await db
		.select({ id: refreshTokens.id, expiresAt: refreshTokens.expires_at })
		.from(refreshTokens)
		.where(eq(refreshTokens.username, authenticatedUser.username));
	expect(initialSessions).toHaveLength(1);
	expect(initialSessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

	const refreshResponse = await authenticatedRequest('/refresh/auth', 'POST', session);
	expectJsonResponse(refreshResponse, 200);
	expect(await refreshResponse.json()).toEqual({ message: 'Tokens refreshed successfully' });
	expect(requiredCookie(session, 'access_token') !== initialAccessCookie).toBe(true);
	expect(requiredCookie(session, 'refresh_token') !== initialRefreshCookie).toBe(true);

	const rotatedAccessVerification = await authenticatedRequest('/verify', 'GET', session);
	expectJsonResponse(rotatedAccessVerification, 200);
	expect(await rotatedAccessVerification.json()).toMatchObject({
		message: 'Token verified successfully',
		user: {
			id: authenticatedUser.id,
			profile_id: authenticatedUser.profile_id,
			username: authenticatedUser.username,
			email: authenticatedUser.email,
		},
	});

	const rotatedUserResponse = await authenticatedRequest('/user/auth', 'GET', session);
	expectJsonResponse(rotatedUserResponse, 200);
	expect(await rotatedUserResponse.json()).toMatchObject(authenticatedUser);

	const rotatedSessions = await db
		.select({ id: refreshTokens.id, expiresAt: refreshTokens.expires_at })
		.from(refreshTokens)
		.where(eq(refreshTokens.username, authenticatedUser.username));
	expect(rotatedSessions).toHaveLength(1);
	expect(rotatedSessions[0]!.id).not.toBe(initialSessions[0]!.id);
	expect(rotatedSessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

	const firstLogout = await authenticatedRequest('/logout/auth', 'POST', session);
	expectJsonResponse(firstLogout, 200);
	expect(await firstLogout.json()).toEqual({ message: 'Logout successful' });
	expectAuthCookiesCleared(firstLogout);
	expect(session.header().length).toBe(0);
	expect(
		await db
			.select({ id: refreshTokens.id })
			.from(refreshTokens)
			.where(eq(refreshTokens.username, authenticatedUser.username)),
	).toHaveLength(0);
	const loggedOutUserResponse = await authenticatedRequest('/user/auth', 'GET', session);
	expectJsonResponse(loggedOutUserResponse, 401);

	const forgotPasswordResponse = await app.request(
		'/password/forgot-password',
		jsonRequest('POST', { email: credentials.email }),
	);
	expectJsonResponse(forgotPasswordResponse, 200);
	expect(await forgotPasswordResponse.json()).toEqual({
		message: 'If the email exists, a reset link was sent.',
	});

	const resetEmail = await waitForEmail(credentials.email, 'Password Reset');
	const resetToken = extractTokenFromLink(`${resetEmail.HTML} ${resetEmail.Text}`, 'token');
	const pendingResetRows = await db
		.select({ id: password_reset_tokens.id, expiresAt: password_reset_tokens.expires_at })
		.from(password_reset_tokens)
		.where(eq(password_reset_tokens.user_id, authenticatedUser.id));
	expect(pendingResetRows).toHaveLength(1);
	expect(pendingResetRows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

	const resetVerification = await app.request(
		`/password/auth/reset-verify-token?token=${encodeURIComponent(resetToken)}`,
	);
	expectJsonResponse(resetVerification, 200);
	expect(await resetVerification.json()).toEqual({ valid: true, id: authenticatedUser.id });

	const resetResponse = await app.request(
		'/password/auth/reset',
		jsonRequest('POST', { token: resetToken, newPassword: replacementPassword }),
	);
	expectJsonResponse(resetResponse, 200);
	expect(await resetResponse.json()).toEqual({ message: 'Password updated successfully!' });
	expect(
		await db
			.select({ id: password_reset_tokens.id })
			.from(password_reset_tokens)
			.where(eq(password_reset_tokens.user_id, authenticatedUser.id)),
	).toHaveLength(0);

	const oldLogin = await app.request(
		'/login',
		jsonRequest('POST', { email: credentials.email, password: credentials.password }),
	);
	expectJsonResponse(oldLogin, 401);
	expect(await oldLogin.json()).toEqual({ message: 'invalid email or password' });
	expect(oldLogin.headers.getSetCookie().length).toBe(0);

	const newLogin = await app.request(
		'/login',
		jsonRequest('POST', { email: credentials.email, password: replacementPassword }),
	);
	captureCookies(newLogin, session);
	expectJsonResponse(newLogin, 200);
	expect(await newLogin.json()).toMatchObject({
		message: 'login successful',
		user: {
			id: authenticatedUser.id,
			profile_id: authenticatedUser.profile_id,
			username: credentials.username,
		},
	});
	expect(Boolean(requiredCookie(session, 'access_token'))).toBe(true);
	expect(Boolean(requiredCookie(session, 'refresh_token'))).toBe(true);

	const replacementAccessVerification = await authenticatedRequest('/verify', 'GET', session);
	expectJsonResponse(replacementAccessVerification, 200);
	expect(await replacementAccessVerification.json()).toMatchObject({
		message: 'Token verified successfully',
		user: {
			id: authenticatedUser.id,
			profile_id: authenticatedUser.profile_id,
			username: authenticatedUser.username,
			email: authenticatedUser.email,
		},
	});

	const replacementUserResponse = await authenticatedRequest('/user/auth', 'GET', session);
	expectJsonResponse(replacementUserResponse, 200);
	expect(await replacementUserResponse.json()).toMatchObject(authenticatedUser);

	const replacementSessions = await db
		.select({ id: refreshTokens.id, expiresAt: refreshTokens.expires_at })
		.from(refreshTokens)
		.where(eq(refreshTokens.username, authenticatedUser.username));
	expect(replacementSessions).toHaveLength(1);
	expect(replacementSessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

	const finalLogout = await authenticatedRequest('/logout/auth', 'POST', session);
	expectJsonResponse(finalLogout, 200);
	expect(await finalLogout.json()).toEqual({ message: 'Logout successful' });
	expectAuthCookiesCleared(finalLogout);
	expect(session.header().length).toBe(0);
	expect(
		await db
			.select({ id: refreshTokens.id })
			.from(refreshTokens)
			.where(eq(refreshTokens.username, authenticatedUser.username)),
	).toHaveLength(0);
});
