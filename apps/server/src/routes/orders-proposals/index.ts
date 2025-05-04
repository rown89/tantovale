import { createClient } from 'src/database';
import { createRouter } from 'src/lib/create-app';
import { ordersProposals } from 'src/database/schemas/orders_proposals';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authPath } from 'src/utils/constants';
import { orderProposalStatusValues } from 'src/database/schemas/enumerated_values';
import { items } from 'src/database/schemas/items';
export const ordersProposalsRoute = createRouter()
	.post(
		`${authPath}/create`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				item_id: z.number(),
				price: z.number(),
			}),
		),
		async (c) => {
			const { item_id, price } = c.req.valid('json');
			const user = c.var.user;

			const { db } = createClient();

			// check if the item exists and is available and published
			const [item] = await db
				.select({
					id: items.id,
				})
				.from(items)
				.where(and(eq(items.id, item_id), eq(items.status, 'available'), eq(items.published, true)))
				.limit(1);

			if (!item) return c.json({ error: 'Item not found' }, 404);

			// check if the user already has a proposal for this item
			const [proposalCheck] = await db
				.select()
				.from(ordersProposals)
				.where(and(eq(ordersProposals.item_id, item_id), eq(ordersProposals.user_id, user.id)))
				.limit(1);

			if (proposalCheck) return c.json({ error: 'Proposal already exists' }, 400);

			const [proposal] = await db
				.insert(ordersProposals)
				.values({
					item_id,
					user_id: user.id,
					price,
				})
				.returning();

			return c.json(proposal);
		},
	)
	.post(
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
	)
	.put(
		`${authPath}`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				id: z.number(),
				status: z.enum(orderProposalStatusValues),
				item_id: z.number(),
			}),
		),
		async (c) => {
			const user = c.var.user;
			const { id, status, item_id } = await c.req.valid('json');

			const { db } = createClient();

			const [item] = await db
				.select()
				.from(items)
				.where(and(eq(items.id, item_id), eq(items.user_id, user.id)))
				.limit(1);

			if (!item) return c.json({ error: 'Item not found' }, 404);

			// check if the item_id is owned by the user
			if (item.user_id !== user.id) return c.json({ error: 'Item not found' }, 404);

			const [updatedProposal] = await db
				.update(ordersProposals)
				.set({ status })
				.where(eq(ordersProposals.id, id))
				.returning();

			if (!updatedProposal) return c.json({ error: 'Proposal not found' }, 404);

			return c.json(updatedProposal);
		},
	);
