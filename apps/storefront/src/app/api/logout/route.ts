import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { client } from '@workspace/server/client-rpc';
import { bridgeAuthLogout } from '#utils/auth-cookie-bridge';

export async function GET(request: NextRequest) {
	const cookieStore = await cookies();
	const accessToken = cookieStore.get('access_token')?.value;
	const refreshToken = cookieStore.get('refresh_token')?.value;

	await bridgeAuthLogout({
		accessToken,
		refreshToken,
		cookieStore,
		isProductionMode: process.env.NODE_ENV === 'production',
		requestLogout: (cookie) => client.logout.auth.$post({}, { headers: { cookie }, init: { credentials: 'include' } }),
	});

	return NextResponse.redirect(new URL('/', request.url));
}
