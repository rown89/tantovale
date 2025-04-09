import 'dotenv/config';

import { env } from 'hono/adapter';
import { sign } from 'hono/jwt';
import { describeRoute } from 'hono-openapi';
import { validator as zValidator } from 'hono-openapi/zod';

import { checkUser } from '../../lib/utils';
import { hashPassword } from '../../lib/password';
import {
	DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES,
	DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES_IN_MS,
	getNodeEnvMode,
} from '../../utils/constants';
import { createClient } from '../../database';
import { profiles, users } from '../../database/schemas/schema';
import { sendVerifyEmail } from '../../mailer/templates/verify-email';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';

import { createRouter } from '../../lib/create-app';
import { parseEnv } from '../../env';
import { UserSchema } from '../../extended_schemas/users';

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
	zValidator('json', UserSchema),
	async (c) => {
		const { NODE_ENV, EMAIL_VERIFY_TOKEN_SECRET } = env<{
			NODE_ENV: string;
			EMAIL_VERIFY_TOKEN_SECRET: string;
		}>(c);

		const { isProductionMode, isStagingMode } = getNodeEnvMode(NODE_ENV);

		try {
			const values = await c.req.valid('json');
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
			// Create new user
			const [results] = await db
				.insert(users)
				.values({ ...values, password: hashedPassword })
				.returning();

			if (!results) {
				return c.json({ message: "Signup procedure can't create user" }, 500);
			}

			const [profile] = await db
				.insert(profiles)
				.values({
					user_id: results.id,
					...rest,
				})
				.returning();

			if (!profile) {
				return c.json({ message: "Signup procedure can't create user" }, 500);
			}

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

			const verificationLink = `${parseEnv(process.env).STOREFRONT_HOSTNAME}/api/verify/email?token=${email_activation_token}`;

			if (isProductionMode || isStagingMode) {
				await sendVerifyEmail(email, verificationLink);
			} else {
				console.log('\nverificationLink: ', verificationLink, '\n');
			}

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
