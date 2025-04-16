import { eq, and, isNull } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { getCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';
import { z } from 'zod';
import { createRouter } from '../../lib/create-app';
import { createClient } from '../../database';
import { items } from '../../database/schemas/items';
import { itemsImages } from '../../database/schemas/items_images';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { subcategories } from '../../database/schemas/subcategories';
import { authPath } from '../../utils/constants';
import { userItemsFavorites } from 'src/database/schemas/user_items_favorites';

export const itemTypeSchema = z.object({
	published: z.boolean(),
});

export const itemsRoute = createRouter()
	// get user selling items
	.post(`${authPath}/user_selling_items`, zValidator('json', itemTypeSchema), authMiddleware, async (c) => {
		const { ACCESS_TOKEN_SECRET } = env<{
			ACCESS_TOKEN_SECRET: string;
		}>(c);

		const params = await c.req.json();

		const accessToken = getCookie(c, 'access_token');
		let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
		const user_id = Number(payload.id);

		if (!user_id) return c.json({ message: 'Invalid user id' }, 401);

		const { db } = createClient();

		try {
			const profileItems = await db
				.select({
					id: items.id,
					title: items.title,
					price: items.price,
					created_at: items.created_at,
					published: items.published,
					subcategory_slug: subcategories.slug,
					image: itemsImages.url,
				})
				.from(items)
				.innerJoin(itemsImages, eq(itemsImages.item_id, items.id))
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.where(
					and(
						isNull(items.deleted_at),
						eq(items.published, params.published),
						eq(items.status, 'available'),
						eq(items.user_id, user_id),
						eq(itemsImages.size, 'thumbnail'),
						eq(itemsImages.order_position, 0),
					),
				)
				.orderBy(items.id);

			return c.json(profileItems, 200);
		} catch (error) {
			console.log(error);

			return c.json(
				{
					message: 'Error, cant retrieve profile items',
				},
				500,
			);
		}
	})
	// get all user favorite items
	.get(`${authPath}/favorites`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { db } = createClient();

		try {
			const favorites = await db
				.select({
					id: items.id,
					title: items.title,
					price: items.price,
					published: items.published,
					subcategory_slug: subcategories.slug,
					image: itemsImages.url,
				})
				.from(userItemsFavorites)
				.innerJoin(items, eq(items.id, userItemsFavorites.item_id))
				.innerJoin(itemsImages, eq(itemsImages.item_id, items.id))
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.where(
					and(
						isNull(items.deleted_at),
						eq(items.published, true),
						eq(items.status, 'available'),
						eq(userItemsFavorites.user_id, user.id),
						eq(itemsImages.size, 'thumbnail'),
						eq(itemsImages.order_position, 0),
					),
				)
				.orderBy(items.id);

			console.log(favorites);

			if (!favorites.length) return c.json([], 404);

			return c.json(favorites, 200);
		} catch (error) {
			console.log(error);
			return c.json(
				{
					message: 'Get user favorites error',
				},
				500,
			);
		}
	});
