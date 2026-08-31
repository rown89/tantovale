import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { client } from '@workspace/server/client-rpc';
import { bridgeAuthCookies } from '#utils/auth-cookie-bridge';

export async function GET(request: NextRequest) {
	const token = request.nextUrl.searchParams.get('token');

	if (!token) {
		return NextResponse.json({ error: 'No token provided' });
	}

	const response = await client.verify.email.$get({
		query: { token },
	});

	if (response.status !== 200) {
		return NextResponse.json({ error: 'Invalid verify email token provided' });
	}

	const cookieReader = await cookies();
	if (bridgeAuthCookies(response.headers, cookieReader, { requireCompletePair: true }) !== 2) {
		return NextResponse.json({ error: 'Invalid token provided' });
	}

	return NextResponse.redirect(new URL('/', request.url));
}
