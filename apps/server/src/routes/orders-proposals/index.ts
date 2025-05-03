import { createClient } from 'src/database';
import { createRouter } from 'src/lib/create-app';
import { ordersProposals } from 'src/database/schemas/orders_proposals';
import { eq } from 'drizzle-orm';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authPath } from 'src/utils/constants';

export const ordersProposalsRoute = createRouter().post(
	`${authPath}`,
	authMiddleware,
	zValidator(
		'json',
		z.object({
			id: z.number(),
		}),
	),
	async (c) => {
		const { id } = await c.req.valid('json');

		const { db } = createClient();

		const proposal = await db
			.select({
				status: ordersProposals.status,
				price: ordersProposals.price,
			})
			.from(ordersProposals)
			.where(eq(ordersProposals.id, id))
			.limit(1);

		if (!proposal[0]) return c.json({ error: 'Proposal not found' }, 404);

		return c.json(proposal[0]);
	},
);
