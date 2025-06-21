import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import { createClient } from '#database/index';
import { profiles_items_favorites, profiles } from '#db-schema';
import { createRouter } from 'src/lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { authPath } from '#utils/constants';

export const favoritesRoute = createRouter()
	// Check if item is an user favorite
	.get(`${authPath}/check/:item_id`, authMiddleware, async (c) => {
		const user = c.var.user;
		const item_id = Number(c.req.param('item_id'));

		if (!item_id) return c.json({ error: 'Item id is required' }, 400);
		if (isNaN(item_id)) return c.json({ message: 'Invalid Item ID' }, 400);

		const { db } = createClient();

		const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.user_id, user.id)).limit(1);

		if (!profile) return c.json({ message: 'Profile not found' }, 404);

		try {
			const [itemIsFavorite] = await db
				.select({
					item_id: profiles_items_favorites.id,
				})
				.from(profiles_items_favorites)
				.where(and(eq(profiles_items_favorites.item_id, item_id), eq(profiles_items_favorites.profile_id, profile.id)));

			return c.json(itemIsFavorite?.item_id ? true : false, 200);
		} catch (error) {
			console.log(error);
			return c.json({ message: 'Get item error' }, 500);
		}
	})
	// handle favorite (add or remove)
	.post(
		`${authPath}/handle`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				action: z.enum(['add', 'remove']),
				item_id: z.number(),
			}),
		),
		async (c) => {
			const user = c.var.user;
			const { item_id, action } = c.req.valid('json');

			const { db } = createClient();

			const [profile] = await db
				.select({ id: profiles.id })
				.from(profiles)
				.where(eq(profiles.user_id, user.id))
				.limit(1);

			if (!profile) return c.json({ message: 'Profile not found' }, 404);

			try {
				if (action === 'add') {
					await db.insert(profiles_items_favorites).values({
						profile_id: profile.id,
						item_id,
					});

					return c.json(true);
				} else {
					await db.delete(profiles_items_favorites).where(eq(profiles_items_favorites.item_id, item_id));

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
		},
	);
