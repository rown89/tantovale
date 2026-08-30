import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';

import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { findValidResetToken } from './reset-token.service';

export const passwordResetVerifyToken = createRouter()
	// Verify Reset Token
	.get(`/${authPath}/reset-verify-token`, async (c) => {
		const { RESET_TOKEN_SECRET } = env<{
			RESET_TOKEN_SECRET: string;
		}>(c);

		const token = c.req.query('token');

		if (!token) return c.json({ error: 'Token required' }, 400);

		try {
			const payload = await verify(token, RESET_TOKEN_SECRET);
			const storedToken = await findValidResetToken(token);
			if (!storedToken || payload.id !== storedToken.user_id) {
				return c.json({ error: 'Invalid or expired token' }, 400);
			}

			return c.json({ valid: true, id: storedToken.user_id });
		} catch {
			return c.json({ error: 'Invalid or expired token' }, 400);
		}
	});
