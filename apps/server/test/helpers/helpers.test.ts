import { describe, expect, it } from 'vitest';

import { extractTokenFromLink } from './mailpit';
import { captureCookies, CookieJar, jsonRequest } from './request';

describe('API test helpers', () => {
	it('updates a cookie jar from multiple Set-Cookie headers', () => {
		const jar = new CookieJar();

		jar.capture(['access_token=one; Path=/; HttpOnly', 'refresh_token=two; Path=/; HttpOnly']);

		expect(jar.header()).toBe('access_token=one; refresh_token=two');

		jar.capture(['access_token=; Max-Age=0; Path=/']);

		expect(jar.header()).toBe('refresh_token=two');
	});

	it('ignores malformed cookies and removes case-insensitive Max-Age deletions', () => {
		const jar = new CookieJar();
		jar.capture(['access_token=one', 'not-a-cookie', 'refresh_token=two; MAX-age=0']);

		expect(jar.header()).toBe('access_token=one');
	});

	it('builds JSON requests with an optional cookie header and body', () => {
		const jar = new CookieJar();
		jar.capture(['access_token=one']);

		expect(jsonRequest('POST', { email: 'user@tantovale.test' }, jar)).toEqual({
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: 'access_token=one',
			},
			body: JSON.stringify({ email: 'user@tantovale.test' }),
		});
		expect(jsonRequest('GET', undefined, new CookieJar())).toEqual({
			method: 'GET',
			headers: { 'content-type': 'application/json' },
		});
	});

	it('captures cookies from the response getSetCookie API', () => {
		const jar = new CookieJar();
		const response = {
			headers: {
				getSetCookie: () => ['access_token=one; Path=/', 'refresh_token=two; Path=/'],
			},
		} as Response;

		captureCookies(response, jar);

		expect(jar.header()).toBe('access_token=one; refresh_token=two');
	});

	it('extracts a named token from an email link', () => {
		expect(extractTokenFromLink('Visit http://storefront.test/verify?token=abc.def', 'token')).toBe('abc.def');
	});

	it('extracts parameters from HTML-escaped email links', () => {
		expect(extractTokenFromLink('https://storefront.test/verify?token=abc.def&amp;source=email', 'token')).toBe(
			'abc.def',
		);
	});

	it('reports missing email links and parameters', () => {
		expect(() => extractTokenFromLink('No link here', 'token')).toThrow('Email contains no HTTP link');
		expect(() => extractTokenFromLink('https://storefront.test/verify', 'token')).toThrow(
			'Email link has no token parameter',
		);
	});
});
