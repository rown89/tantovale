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

function expectAuthCookiesCleared(response: Response): void {
	expect(response.headers.getSetCookie()).toEqual(
		expect.arrayContaining([
			expect.stringMatching(/^access_token=;.*Max-Age=0/i),
			expect.stringMatching(/^refresh_token=;.*Max-Age=0/i),
		]),
	);
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

	const signupResponse = await app.request('/signup', jsonRequest('POST', credentials));
	const signupCookies = new CookieJar();
	captureCookies(signupResponse, signupCookies);

	expect(signupResponse.status).toBe(201);
	expect(await signupResponse.json()).toEqual({ message: 'Successful Signup' });
	expect(await db.select({ id: users.id }).from(users)).toHaveLength(1);
	expect(await db.select({ id: profiles.id }).from(profiles)).toHaveLength(1);

	const verificationEmail = await waitForEmail(credentials.email, 'Attivazione account');
	const verificationToken = extractTokenFromLink(`${verificationEmail.HTML} ${verificationEmail.Text}`, 'token');
	expect(requiredCookie(signupCookies, 'email_activation_token')).toBe(verificationToken);

	const verificationResponse = await app.request(`/verify/email?token=${encodeURIComponent(verificationToken)}`);
	const session = new CookieJar();
	captureCookies(verificationResponse, session);

	expect(verificationResponse.status).toBe(200);
	expect(await verificationResponse.json()).toEqual({ message: 'Email verified successfully!' });
	const initialAccessCookie = requiredCookie(session, 'access_token');
	const initialRefreshCookie = requiredCookie(session, 'refresh_token');

	const accessVerification = await authenticatedRequest('/verify', 'GET', session);
	const accessVerificationBody = (await accessVerification.json()) as {
		message: string;
		user: { email: string; email_verified: boolean; username: string };
	};
	expect(accessVerification.status).toBe(200);
	expect(accessVerificationBody).toMatchObject({
		message: 'Token verified successfully',
		user: {
			email: credentials.email,
			email_verified: true,
			username: credentials.username,
		},
	});

	const userResponse = await authenticatedRequest('/user/auth', 'GET', session);
	const authenticatedUser = (await userResponse.json()) as {
		id: number;
		profile_id: number;
		username: string;
		email: string;
		email_verified: boolean;
		phone_verified: boolean;
	};
	expect(userResponse.status).toBe(200);
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
	expect(refreshResponse.status).toBe(200);
	expect(await refreshResponse.json()).toEqual({ message: 'Tokens refreshed successfully' });
	expect(requiredCookie(session, 'access_token')).not.toBe(initialAccessCookie);
	expect(requiredCookie(session, 'refresh_token')).not.toBe(initialRefreshCookie);

	const rotatedSessions = await db
		.select({ id: refreshTokens.id, expiresAt: refreshTokens.expires_at })
		.from(refreshTokens)
		.where(eq(refreshTokens.username, authenticatedUser.username));
	expect(rotatedSessions).toHaveLength(1);
	expect(rotatedSessions[0]!.id).not.toBe(initialSessions[0]!.id);
	expect(rotatedSessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

	const firstLogout = await authenticatedRequest('/logout/auth', 'POST', session);
	expect(firstLogout.status).toBe(200);
	expect(await firstLogout.json()).toEqual({ message: 'Logout successful' });
	expectAuthCookiesCleared(firstLogout);
	expect(session.header()).toBe('');
	expect(
		await db
			.select({ id: refreshTokens.id })
			.from(refreshTokens)
			.where(eq(refreshTokens.username, authenticatedUser.username)),
	).toHaveLength(0);
	expect((await authenticatedRequest('/user/auth', 'GET', session)).status).toBe(401);

	const forgotPasswordResponse = await app.request(
		'/password/forgot-password',
		jsonRequest('POST', { email: credentials.email }),
	);
	expect(forgotPasswordResponse.status).toBe(200);
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
	expect(resetVerification.status).toBe(200);
	expect(await resetVerification.json()).toEqual({ valid: true, id: authenticatedUser.id });

	const resetResponse = await app.request(
		'/password/auth/reset',
		jsonRequest('POST', { token: resetToken, newPassword: replacementPassword }),
	);
	expect(resetResponse.status).toBe(200);
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
	expect(oldLogin.status).toBe(401);
	expect(await oldLogin.json()).toEqual({ message: 'invalid email or password' });
	expect(oldLogin.headers.getSetCookie()).toEqual([]);

	const newLogin = await app.request(
		'/login',
		jsonRequest('POST', { email: credentials.email, password: replacementPassword }),
	);
	const replacementSession = new CookieJar();
	captureCookies(newLogin, replacementSession);
	expect(newLogin.status).toBe(200);
	expect(await newLogin.json()).toMatchObject({
		message: 'login successful',
		user: {
			id: authenticatedUser.id,
			profile_id: authenticatedUser.profile_id,
			username: credentials.username,
		},
	});
	expect(requiredCookie(replacementSession, 'access_token')).not.toBe('');
	expect(requiredCookie(replacementSession, 'refresh_token')).not.toBe('');

	const replacementSessions = await db
		.select({ id: refreshTokens.id, expiresAt: refreshTokens.expires_at })
		.from(refreshTokens)
		.where(eq(refreshTokens.username, authenticatedUser.username));
	expect(replacementSessions).toHaveLength(1);
	expect(replacementSessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

	const finalLogout = await authenticatedRequest('/logout/auth', 'POST', replacementSession);
	expect(finalLogout.status).toBe(200);
	expect(await finalLogout.json()).toEqual({ message: 'Logout successful' });
	expectAuthCookiesCleared(finalLogout);
	expect(replacementSession.header()).toBe('');
	expect(
		await db
			.select({ id: refreshTokens.id })
			.from(refreshTokens)
			.where(eq(refreshTokens.username, authenticatedUser.username)),
	).toHaveLength(0);
});
