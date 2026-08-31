'use server';

import { client } from '@workspace/server/client-rpc';
import { LoginActionResponse, LoginFormData } from './types';
import { cookies } from 'next/headers';
import { UserProfileSchema } from '@workspace/server/extended_schemas';
import { bridgeAuthCookies } from '#utils/auth-cookie-bridge';

type LoginDependencies = {
	loginPost(input: { json: LoginFormData }): Promise<Response>;
	getCookieStore(): ReturnType<typeof cookies>;
};

const defaultLoginDependencies: LoginDependencies = {
	loginPost: (input) => client.login.$post(input),
	getCookieStore: cookies,
};

export async function submitLogin(
	prevState: LoginActionResponse | null,
	formData: FormData,
	dependencies: LoginDependencies = defaultLoginDependencies,
): Promise<LoginActionResponse> {
	const rawData: LoginFormData = {
		email: formData.get('email') as string,
		password: formData.get('password') as string,
	};

	try {
		const validateData = UserProfileSchema.pick({
			email: true,
			password: true,
		}).safeParse(rawData);

		if (!validateData.success) {
			return {
				success: false,
				message: 'Check your credentials',
				inputs: rawData,
				errors: validateData.error.flatten().fieldErrors,
			};
		}

		const loginResponse = await dependencies.loginPost({ json: rawData });

		if (!loginResponse.ok) {
			const data = await loginResponse?.json();

			return {
				success: false,
				message: data?.message || 'An error occurred',
			};
		}

		const cookieReader = await dependencies.getCookieStore();
		if (bridgeAuthCookies(loginResponse.headers, cookieReader, { requireCompletePair: true }) !== 2) {
			return {
				success: false,
				inputs: rawData,
				message: 'No cookie set',
			};
		}

		const loginData = await loginResponse.json();
		const { user } = loginData;

		const result = {
			success: true,
			message: 'Correctly logged-in',
			user: {
				...user,
				email: rawData.email,
			},
		};

		return result;
	} catch {
		const result = {
			success: false,
			inputs: rawData,
			message: 'An unexpected error occurred with login form',
		};

		return result;
	}
}
