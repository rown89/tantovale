import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';

import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';

export const passwordResetVerifyToken = createRouter()
	// Verify Reset Token
	.get(`/${authPath}/reset-verify-token`, authMiddleware, async (c) => {
		const { RESET_TOKEN_SECRET } = env<{
			RESET_TOKEN_SECRET: string;
		}>(c);

		const token = c.req.query('token');

		if (!token) return c.json({ error: 'Token required' }, 400);

		try {
			const payload = await verify(token, RESET_TOKEN_SECRET);
			return c.json({ valid: true, id: payload.id });
		} catch (error) {
			return c.json({ error: 'Invalid or expired token' }, 400);
		}
	});
