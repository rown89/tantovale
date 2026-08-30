import { env } from 'hono/adapter';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { findVerifiedResetToken } from './reset-token.service';

export const passwordResetVerifyToken = createRouter()
	// Verify Reset Token
	.get(`/${authPath}/reset-verify-token`, async (c) => {
		const { RESET_TOKEN_SECRET } = env<{
			RESET_TOKEN_SECRET: string;
		}>(c);

		const token = c.req.query('token');

		if (!token) return c.json({ error: 'Token required' }, 400);

		try {
			const storedToken = await findVerifiedResetToken(token, RESET_TOKEN_SECRET);
			if (!storedToken) {
				return c.json({ error: 'Invalid or expired token' }, 400);
			}

			return c.json({ valid: true, id: storedToken.user_id });
		} catch {
			return c.json({ error: 'Unable to verify reset token' }, 500);
		}
	});
