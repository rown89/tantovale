import { env } from 'hono/adapter';
import { and, eq, gt } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';

import { hashPassword, passwordSchema } from '../../lib/password';
import { acquireUserTransactionLock } from '../../lib/user-transaction-lock';
import { createClient } from '../../database';
import { users, password_reset_tokens, refreshTokens } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { findVerifiedResetToken } from './reset-token.service';

const resetPasswordSchema = z.object({
	token: z.string().min(1),
	newPassword: passwordSchema,
});

export const passwordResetRoute = createRouter()
	// Update Password
	.post(`/${authPath}/reset`, zValidator('json', resetPasswordSchema), async (c) => {
		const { RESET_TOKEN_SECRET } = env<{
			RESET_TOKEN_SECRET: string;
		}>(c);

		const { token, newPassword } = c.req.valid('json');

		let storedToken;
		try {
			storedToken = await findVerifiedResetToken(token, RESET_TOKEN_SECRET);
		} catch {
			return c.json({ error: 'Unable to reset password' }, 500);
		}
		if (!storedToken) {
			return c.json({ error: 'Invalid or expired token' }, 400);
		}

		try {
			const hashedPassword = await hashPassword(newPassword);
			const { db } = createClient();
			const updated = await db.transaction(async (tx) => {
				await acquireUserTransactionLock(tx, storedToken.user_id);
				const consumed = await tx
					.delete(password_reset_tokens)
					.where(
						and(
							eq(password_reset_tokens.token, token),
							eq(password_reset_tokens.user_id, storedToken.user_id),
							gt(password_reset_tokens.expires_at, new Date()),
						),
					)
					.returning({ userId: password_reset_tokens.user_id });

				if (consumed.length !== 1 || consumed[0]?.userId !== storedToken.user_id) {
					return false;
				}

				const changed = await tx
					.update(users)
					.set({ password: hashedPassword })
					.where(eq(users.id, storedToken.user_id))
					.returning({ id: users.id, username: users.username });

				if (changed.length !== 1) {
					throw new Error('Reset user no longer exists');
				}

				await tx.delete(refreshTokens).where(eq(refreshTokens.username, changed[0]!.username));

				return true;
			});

			if (!updated) {
				return c.json({ error: 'Invalid or expired token' }, 400);
			}

			return c.json({ message: 'Password updated successfully!' });
		} catch {
			return c.json({ error: 'Unable to reset password' }, 500);
		}
	});
