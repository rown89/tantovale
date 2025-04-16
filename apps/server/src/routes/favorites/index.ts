import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import { createClient } from 'src/database';
import { userItemsFavorites } from 'src/database/schemas/user_items_favorites';
import { createRouter } from 'src/lib/create-app';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { users } from 'src/database/schemas/users';
import { authPath } from 'src/utils/constants';

export const favoritesRoute = createRouter()
	// get all user favorite items
	.get('/', authMiddleware, async (c) => {
		const user = c.var.user;

		return c.json({});
	})
	// Check if item is an user favorite
	.get(`${authPath}/check/:item_id`, authMiddleware, async (c) => {
		const user = c.var.user;
		const item_id = Number(c.req.param('item_id'));

		if (!item_id) return c.json({ error: 'Item id is required' }, 400);
		if (isNaN(item_id)) return c.json({ message: 'Invalid Item ID' }, 400);

		const { db } = createClient();

		try {
			const [itemIsFavorite] = await db
				.select({
					item_id: userItemsFavorites.id,
				})
				.from(userItemsFavorites)
				.where(and(eq(userItemsFavorites.item_id, item_id), eq(userItemsFavorites.user_id, user.id)));

			return c.json(itemIsFavorite?.item_id ? true : false, 200);
		} catch (error) {
			console.log(error);
			return c.json({ message: 'Get item error' }, 500);
		}
	})
	.post(
		`${authPath}/handle`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				action: z.string(),
				item_id: z.number(),
			}),
		),
		async (c) => {
			const user = c.var.user;
			const { item_id, action } = c.req.valid('json');

			const { db } = createClient();

			try {
				if (action === 'add') {
					await db.insert(userItemsFavorites).values({
						user_id: user.id,
						item_id,
					});

					return c.json(true);
				} else {
					await db.delete(userItemsFavorites).where(eq(userItemsFavorites.item_id, item_id));

					return c.json(false);
				}
			} catch (error) {
				return c.json(
					{
						message: '',
					},
					500,
				);
			}

			return c.json({});
		},
	);
