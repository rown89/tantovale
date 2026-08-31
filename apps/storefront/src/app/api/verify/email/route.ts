import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { client } from '@workspace/server/client-rpc';
import { bridgeAuthCookies } from '#utils/auth-cookie-bridge';

type VerifyEmailDependencies = {
	verifyGet(input: { query: { token: string } }): Promise<Response>;
	getCookieStore(): ReturnType<typeof cookies>;
};

type VerifyEmailRouteContext = {
	params: Promise<unknown>;
	dependencies?: VerifyEmailDependencies;
};

const defaultVerifyEmailDependencies: VerifyEmailDependencies = {
	verifyGet: (input) => client.verify.email.$get(input),
	getCookieStore: cookies,
};

export async function GET(request: NextRequest, context: VerifyEmailRouteContext) {
	const dependencies = context.dependencies ?? defaultVerifyEmailDependencies;
	const token = request.nextUrl.searchParams.get('token');

	if (!token) {
		return NextResponse.json({ error: 'No token provided' });
	}

	const response = await dependencies.verifyGet({ query: { token } });

	if (response.status !== 200) {
		return NextResponse.json({ error: 'Invalid verify email token provided' });
	}

	const cookieReader = await dependencies.getCookieStore();
	if (bridgeAuthCookies(response.headers, cookieReader, { requireCompletePair: true }) !== 2) {
		return NextResponse.json({ error: 'Invalid token provided' });
	}

	return NextResponse.redirect(new URL('/', request.url));
}
