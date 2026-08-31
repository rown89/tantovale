import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { client } from '@workspace/server/client-rpc';
import { bridgeAuthLogout } from '#utils/auth-cookie-bridge';

type LogoutDependencies = {
	getCookieStore(): ReturnType<typeof cookies>;
	logoutPost(
		input: Record<string, never>,
		options: { headers: { cookie: string }; init: { credentials: 'include' } },
	): Promise<Response>;
};

type LogoutRouteContext = {
	params: Promise<unknown>;
	dependencies?: LogoutDependencies;
};

const defaultLogoutDependencies: LogoutDependencies = {
	getCookieStore: cookies,
	logoutPost: (input, options) => client.logout.auth.$post(input, options),
};

export async function GET(request: NextRequest, context: LogoutRouteContext) {
	const dependencies = context.dependencies ?? defaultLogoutDependencies;
	const cookieStore = await dependencies.getCookieStore();
	const accessToken = cookieStore.get('access_token')?.value;
	const refreshToken = cookieStore.get('refresh_token')?.value;

	await bridgeAuthLogout({
		accessToken,
		refreshToken,
		cookieStore,
		isProductionMode: process.env.NODE_ENV === 'production',
		requestLogout: (cookie) => dependencies.logoutPost({}, { headers: { cookie }, init: { credentials: 'include' } }),
	});

	return NextResponse.redirect(new URL('/', request.url));
}
