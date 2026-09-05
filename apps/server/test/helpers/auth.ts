import { app } from '../../src/app';
import type { createUserFixture } from '../fixtures/factories';
import { captureCookies, CookieJar, jsonRequest } from './request';

type UserFixture = Awaited<ReturnType<typeof createUserFixture>>;

export async function loginAs(fixture: UserFixture): Promise<CookieJar> {
	const jar = new CookieJar();
	const response = await app.request(
		'/login',
		jsonRequest('POST', {
			email: fixture.user.email,
			password: fixture.password,
		}),
	);

	if (response.status !== 200) {
		throw new Error(`Fixture login failed with ${response.status}`);
	}

	captureCookies(response, jar);
	return jar;
}

export async function authenticatedRequest(
	path: string,
	method: string,
	jar: CookieJar,
	body?: unknown,
): Promise<Response> {
	const response = await app.request(path, jsonRequest(method, body, jar));
	captureCookies(response, jar);
	return response;
}
