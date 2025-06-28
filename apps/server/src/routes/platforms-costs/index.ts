import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';

import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { authPath } from '#utils/constants';
import { calculatePlatformCosts } from '#utils/platform-costs';

export const platformsCostsRoute = createRouter().get(
	`${authPath}/calculate`,
	authMiddleware,
	zValidator(
		'query',
		z.object({
			item_id: z.string(),
			price: z.string(),
		}),
	),
	async (c) => {
		const user = c.var.user;

		const { item_id, price } = c.req.valid('query');

		try {
			const platformCosts = await calculatePlatformCosts({
				item_id: Number(item_id),
				price: Number(price),
				buyer_profile_id: user.profile_id,
				buyer_email: user.email,
			});

			return c.json(platformCosts);
		} catch (error) {
			return c.json({ error: 'Failed to get platforms costs' }, 500);
		}
	},
);
