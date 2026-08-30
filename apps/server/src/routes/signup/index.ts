import { env } from 'hono/adapter';
import { sign } from 'hono/jwt';
import { describeRoute } from 'hono-openapi';

import { checkUser } from '../../lib/utils';
import { hashPassword } from '../../lib/password';
import {
	DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES,
	DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES_IN_MS,
	environment,
	getNodeEnvMode,
} from '../../utils/constants';
import { createClient } from '../../database';
import { profiles, users } from '../../database/schemas/schema';
import { sendVerifyEmail } from '../../mailer/templates/verify-email';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';

import { createRouter } from '../../lib/create-app';
import { UserProfileSchema } from '../../extended_schemas/users';
import { zValidator } from '@hono/zod-validator';

export const signupRoute = createRouter().post(
	'/',
	describeRoute({
		description: 'Create a user',
		responses: {
			200: {
				description: 'Successful Signup',
			},
		},
	}),
	zValidator('json', UserProfileSchema),
	async (c) => {
		const { NODE_ENV, EMAIL_VERIFY_TOKEN_SECRET } = env<{
			NODE_ENV: string;
			EMAIL_VERIFY_TOKEN_SECRET: string;
		}>(c);

		const { isDevelopmentMode, isProductionMode } = getNodeEnvMode(NODE_ENV);

		try {
			const values = c.req.valid('json');
			const { password, username, email, ...rest } = values;

			const userAlreadyExist = await checkUser(c, username, 'username');
			const emailAlreadyExist = await checkUser(c, email, 'email');

			if (userAlreadyExist) {
				return c.json({ message: 'Username already exists' }, 422);
			}
			if (emailAlreadyExist) {
				return c.json({ message: 'Email already exists' }, 409);
			}

			const hashedPassword = await hashPassword(password);

			const { db } = createClient();
			const results = await db.transaction(async (tx) => {
				const [createdUser] = await tx
					.insert(users)
					.values({ ...values, password: hashedPassword })
					.returning();

				if (!createdUser) {
					throw new Error("Signup procedure can't create user");
				}

				const [createdProfile] = await tx
					.insert(profiles)
					.values({
						user_id: createdUser.id,
						...rest,
					})
					.returning();

				if (!createdProfile) {
					throw new Error("Signup procedure can't create user");
				}

				return createdUser;
			});

			// Generate JWT token for email verification
			const tmp_token_payload = {
				id: Number(results?.id),
				username: results?.username,
				type: 'email_verification',
				expiresIn: DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES_IN_MS(),
			};

			const email_activation_token = await sign(tmp_token_payload, EMAIL_VERIFY_TOKEN_SECRET);

			setCookie(c, 'email_activation_token', email_activation_token, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES(),
				}),
			});

			const verificationLink = `${environment.STOREFRONT_HOSTNAME}/api/verify/email?token=${email_activation_token}`;

			if (isDevelopmentMode) {
				console.log('\nverificationLink: ', verificationLink, '\n');
			} else await sendVerifyEmail(email, verificationLink);

			return c.json(
				{
					message: 'Successful Signup',
				},
				201,
			);
		} catch (error) {
			console.error(error);

			// Clear email activation token on error
			deleteCookie(c, 'email_activation_token');

			return c.json(
				{
					message: 'Internal server error',
					error,
				},
				500,
			);
		}
	},
);
