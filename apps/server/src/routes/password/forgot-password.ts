import { eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { getNodeEnvMode } from '#utils/constants';
import { sendForgotPasswordEmail } from '#mailer/templates/forgot-password-email';
import { createClient } from '#database';
import { passwordResetTokens } from '#database/schemas/schema';
import { env } from 'hono/adapter';

import { createRouter } from '#lib/create-app';

export const passwordForgotRoute = createRouter().post('/forgot-password', async (c) => {
	// Get the server URL from the environment
	const { hostname, protocol, port } = new URL(c.req.url);

	const { RESET_TOKEN_SECRET, NODE_ENV } = env<{
		RESET_TOKEN_SECRET: string;
		NODE_ENV: string;
	}>(c);

	const { email } = await c.req.json();

	if (!email) {
		return c.json({ error: 'Email is required' }, 400);
	}

	const { db } = createClient();
	// Check if the user exists
	const user = await db.query.users.findFirst({
		where: (tbl) => eq(tbl.email, email),
	});

	if (!user) {
		return c.json({ message: 'If the email exists, a reset link was sent.' });
	}

	// Generate a reset token
	const resetToken = await sign({ id: user.id, email }, RESET_TOKEN_SECRET);

	// Store token in DB (optional but safer)
	await db.insert(passwordResetTokens).values({
		userId: user.id,
		token: resetToken,
		expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
	});

	const serverUrl = `${protocol}//${hostname}${port ? `:${port}` : ''}`;
	const resetLink = `${serverUrl}/password/reset-password?token=${resetToken}`;

	const { isProductionMode, isStagingMode } = getNodeEnvMode(NODE_ENV);
	if (isProductionMode || isStagingMode) {
		await sendForgotPasswordEmail(email, resetLink);
	} else {
		console.log('resetLink: ', resetLink);
	}

	return c.json({ message: 'If the email exists, a reset link was sent.' });
});
