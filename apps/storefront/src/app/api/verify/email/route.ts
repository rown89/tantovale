import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { client } from '@workspace/server/client-rpc';

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

	const cookieHeader = response.headers.get('Set-Cookie');

	if (!cookieHeader) {
		return NextResponse.json({ error: 'Invalid token provided' });
	}

	const cookieReader = await cookies();

	cookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
		const [pair] = cookie.split(';');
		const [name, value] = pair?.split('=') ?? [];
		const trimmedName = name?.trim();
		const trimmedValue = value?.trim();

		if (trimmedName === 'access_token' || trimmedName === 'refresh_token') {
			console.log(`🔑 Setting cookie: ${trimmedName} = ${trimmedValue}`);
			if (trimmedValue) {
				cookieReader.set(trimmedName, trimmedValue);
			}
		}
	});

	return NextResponse.redirect(new URL('/', request.url));
}
