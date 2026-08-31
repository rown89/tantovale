import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { client } from '@workspace/server/client-rpc';

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

	let response: Response;
	try {
		response = await dependencies.verifyGet({ query: { token } });
	} catch {
		return NextResponse.json({ error: 'Unable to verify email' }, { status: 502 });
	}

	if (response.status !== 200) {
		return NextResponse.json({ error: 'Invalid verify email token provided' });
	}

	const cookieReader = await dependencies.getCookieStore();
	cookieReader.set({
		name: 'email_activation_token',
		value: '',
		expires: new Date(0),
		maxAge: 0,
		httpOnly: true,
		secure: true,
		sameSite: 'none',
		path: '/',
		...(process.env.NODE_ENV === 'production' ? { domain: 'tantovale.it' } : {}),
	});

	return NextResponse.redirect(new URL('/login', request.url));
}
