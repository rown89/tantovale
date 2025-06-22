import { NextRequest, NextResponse } from 'next/server';
import { loginUrl, signupUrl } from './routes';
import { client } from '@workspace/server/client-rpc';

const restrictedPaths = ['/auth'];

export async function middleware(req: NextRequest) {
	const { nextUrl } = req;
	const { pathname } = nextUrl;

	const accessToken = req.cookies.get('access_token')?.value;
	const refreshToken = req.cookies.get('refresh_token')?.value;

	const hasTokens = accessToken && refreshToken;

	try {
		// If the user is authenticated
		if (hasTokens) {
			if (pathname === loginUrl || pathname === signupUrl) {
				return NextResponse.redirect(new URL('/', req.url));
			}

			if (pathname === '/auth/profile-setup/address') {
				const hasAddressResponse = await client.profile.auth.profile_active_address_id.$get(
					{},
					{
						headers: {
							cookie: `access_token=${accessToken}; refresh_token=${refreshToken};`,
						},
					},
				);

				if (hasAddressResponse.ok) {
					const address_id = await hasAddressResponse.json();

					// if user already has an active address, redirect to home
					if (address_id) return NextResponse.redirect(new URL('/', req.url));
				}
			}
		} else {
			if (restrictedPaths.find((item) => pathname.includes(item))) {
				return NextResponse.redirect(new URL('/login', req.url));
			}
		}
	} catch (error) {
		console.error('Auth Middleware Error:', error);
	}

	const headers = new Headers(req.headers);
	headers.set('x-current-path', req.nextUrl.pathname);

	return NextResponse.next({
		request: {
			headers,
		},
	});
}
