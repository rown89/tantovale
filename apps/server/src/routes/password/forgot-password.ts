import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { env } from 'hono/adapter';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { sendForgotPasswordEmail } from '../../mailer/templates/forgot-password-email';
import { createClient } from '../../database';
import { password_reset_tokens } from '../../database/schemas/schema';

import { createRouter } from '../../lib/create-app';

const forgotPasswordSchema = z.object({
	email: z.string().email(),
});

export const passwordForgotRoute = createRouter().post(
	'/forgot-password',
	zValidator('json', forgotPasswordSchema),
	async (c) => {
		// Get the server URL from the environment
		const { hostname, protocol, port } = new URL(c.req.url);

		const { RESET_TOKEN_SECRET, NODE_ENV } = env<{
			RESET_TOKEN_SECRET: string;
			NODE_ENV: string;
		}>(c);

		const { email } = c.req.valid('json');

		const { db } = createClient();
		// Check if the user exists
		const user = await db.query.users.findFirst({
			where: { email },
		});

		if (!user) {
			return c.json({ message: 'If the email exists, a reset link was sent.' });
		}

		// Generate a reset token
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
		const resetToken = await sign(
			{
				id: user.id,
				email,
				exp: Math.floor(expiresAt.getTime() / 1_000),
				jti: randomUUID(),
			},
			RESET_TOKEN_SECRET,
		);

		await db.transaction(async (tx) => {
			await tx.delete(password_reset_tokens).where(eq(password_reset_tokens.user_id, user.id));
			await tx.insert(password_reset_tokens).values({
				user_id: user.id,
				token: resetToken,
				expires_at: expiresAt,
			});
		});

		const serverUrl = `${protocol}//${hostname}${port ? `:${port}` : ''}`;
		const resetLink = `${serverUrl}/password/reset-password?token=${resetToken}`;

		if (NODE_ENV !== 'development') {
			await sendForgotPasswordEmail(email, resetLink);
		}

		return c.json({ message: 'If the email exists, a reset link was sent.' });
	},
);
