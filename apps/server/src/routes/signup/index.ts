import { eq } from 'drizzle-orm';
import { env } from 'hono/adapter';
import { setCookie } from 'hono/cookie';
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
import { getAuthTokenOptions } from '../../lib/getAuthTokenOptions';

import { createRouter } from '../../lib/create-app';
import { SignupUserProfileSchema } from '../../extended_schemas/users';
import { zValidator } from '@hono/zod-validator';
import { authenticationOpenApi } from '../../openapi/routes';

export const signupRoute = createRouter().post(
	'/',
	describeRoute(authenticationOpenApi.signup),
	zValidator('json', SignupUserProfileSchema),
	async (c) => {
		const { NODE_ENV, EMAIL_VERIFY_TOKEN_SECRET } = env<{
			NODE_ENV: string;
			EMAIL_VERIFY_TOKEN_SECRET: string;
		}>(c);

		const { isProductionMode } = getNodeEnvMode(NODE_ENV);
		const { db } = createClient();
		let createdUserId: number | undefined;

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

			const createdUser = await db.transaction(async (tx) => {
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
			createdUserId = createdUser.id;

			const emailActivationTokenExpires = DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES();
			const emailActivationToken = await sign(
				{
					id: createdUser.id,
					username: createdUser.username,
					type: 'email_verification',
					auth_epoch: createdUser.updated_at.getTime(),
					exp: DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES_IN_MS(),
				},
				EMAIL_VERIFY_TOKEN_SECRET,
			);
			const verificationLink = `${environment.STOREFRONT_HOSTNAME}/api/verify/email?token=${emailActivationToken}`;

			await sendVerifyEmail(email, verificationLink);

			setCookie(c, 'email_activation_token', emailActivationToken, {
				...getAuthTokenOptions({
					isProductionMode,
					expires: emailActivationTokenExpires,
				}),
			});

			return c.json(
				{
					message: 'Successful Signup',
				},
				201,
			);
		} catch {
			if (createdUserId !== undefined) {
				const userIdToDelete = createdUserId;
				try {
					await db.transaction(async (tx) => {
						// profiles.user_id cascades on delete, so one exact delete compensates both committed inserts.
						await tx.delete(users).where(eq(users.id, userIdToDelete));
					});
				} catch {
					// Without an outbox/dead-letter migration, a simultaneous DB outage can defeat compensation.
				}
			}
			return c.json({ message: 'Internal server error' }, 500);
		}
	},
);
