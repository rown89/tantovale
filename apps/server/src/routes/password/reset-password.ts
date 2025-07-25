import { verify } from 'hono/jwt';
import { env } from 'hono/adapter';
import { eq } from 'drizzle-orm';

import { hashPassword } from '../../lib/password';
import { createClient } from '../../database';
import { users, password_reset_tokens } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';

export const passwordResetRoute = createRouter()
	// Update Password
	.post(`/${authPath}/reset`, authMiddleware, async (c) => {
		const { RESET_TOKEN_SECRET } = env<{
			RESET_TOKEN_SECRET: string;
		}>(c);

		const { token, newPassword } = await c.req.json();

		if (!token || !newPassword) {
			return c.json({ error: 'Token and new password required' }, 400);
		}

		try {
			const payload = await verify(token, RESET_TOKEN_SECRET);

			const { db } = createClient();
			// Check if token exists in DB
			const storedToken = await db.query.password_reset_tokens.findFirst({
				where: (tbl) => eq(tbl.token, token),
			});

			if (!storedToken) {
				return c.json({ error: 'Invalid or expired token' }, 400);
			}

			const hashedPassword = await hashPassword(newPassword);

			// Update user password
			await db
				.update(users)
				.set({ password: hashedPassword })
				.where(eq(users.id, Number(payload.id)));

			// Delete reset token from DB
			await db.delete(password_reset_tokens).where(eq(password_reset_tokens.token, token));

			return c.json({ message: 'Password updated successfully!' });
		} catch (error) {
			return c.json({ error: 'Invalid or expired token' }, 400);
		}
	});
