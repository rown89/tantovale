import { verify } from 'hono/jwt';
import { env } from 'hono/adapter';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { hashPassword } from '../../lib/password';
import { createClient } from '../../database';
import { users, password_reset_tokens } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { findValidResetToken } from './reset-token.service';

const resetPasswordSchema = z.object({
	token: z.string().min(1),
	newPassword: z.string().min(8).max(100),
});

export const passwordResetRoute = createRouter()
	// Update Password
	.post(`/${authPath}/reset`, zValidator('json', resetPasswordSchema), async (c) => {
		const { RESET_TOKEN_SECRET } = env<{
			RESET_TOKEN_SECRET: string;
		}>(c);

		const { token, newPassword } = c.req.valid('json');

		try {
			const payload = await verify(token, RESET_TOKEN_SECRET);
			const storedToken = await findValidResetToken(token);
			if (!storedToken || payload.id !== storedToken.user_id) {
				return c.json({ error: 'Invalid or expired token' }, 400);
			}

			const hashedPassword = await hashPassword(newPassword);
			const { db } = createClient();

			const updated = await db.transaction(async (tx) => {
				const consumed = await tx
					.delete(password_reset_tokens)
					.where(eq(password_reset_tokens.token, token))
					.returning({ userId: password_reset_tokens.user_id });

				if (consumed.length !== 1 || consumed[0]?.userId !== storedToken.user_id) {
					return false;
				}

				const changed = await tx
					.update(users)
					.set({ password: hashedPassword })
					.where(eq(users.id, storedToken.user_id))
					.returning({ id: users.id });

				if (changed.length !== 1) {
					throw new Error('Reset user no longer exists');
				}

				return true;
			});

			if (!updated) {
				return c.json({ error: 'Invalid or expired token' }, 400);
			}

			return c.json({ message: 'Password updated successfully!' });
		} catch {
			return c.json({ error: 'Invalid or expired token' }, 400);
		}
	});
