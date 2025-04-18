import { eq, and, isNull, or } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { getCookie } from 'hono/cookie';
import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';
import { z } from 'zod';

import { createRouter } from '../../lib/create-app';
import { createClient } from '../../database';
import { itemsImages } from '../../database/schemas/items_images';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { subcategories } from '../../database/schemas/subcategories';
import { authPath } from '../../utils/constants';
import { items } from 'src/database/schemas/items';
import { users } from 'src/database/schemas/users';
import { filterValues } from 'src/database/schemas/filter_values';
import { itemsFiltersValues } from 'src/database/schemas/items_filter_values';
import { filters } from 'src/database/schemas/filters';

export const itemTypeSchema = z.object({
	published: z.boolean(),
});

export const itemsRoute = createRouter()
	// get logged user selling items
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
	// get specific user published selling items
	.get(`/:username`, async (c) => {
		const username = c.req.param('username');

		const { db } = createClient();

		try {
			const existingUsername = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.username, username))
				.limit(1);

			if (!existingUsername.length) return c.json({ message: 'No user found' }, 400);

			const userId = Number(existingUsername?.[0]?.id);

			const userItemsWithFilters = await db
				.select({
					id: items.id,
					title: items.title,
					price: items.price,
					category: subcategories.slug,
					filter_id: filters.id,
					filter_slug: filters.slug,
					filter_name: filters.name,
					filter_value: filterValues.value,
					imageUrl: itemsImages.url,
				})
				.from(items)
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.leftJoin(itemsFiltersValues, eq(itemsFiltersValues.item_id, items.id))
				.leftJoin(filterValues, eq(filterValues.id, itemsFiltersValues.filter_value_id))
				.leftJoin(filters, eq(filters.id, filterValues.filter_id))
				.leftJoin(
					itemsImages,
					and(eq(itemsImages.item_id, items.id), eq(itemsImages.order_position, 0), eq(itemsImages.size, 'medium')),
				)
				.where(and(eq(items.user_id, userId), eq(items.published, true), eq(items.status, 'available')));

			// Group properties by item and organize by filter_slug
			interface ItemWithProperties {
				id: number;
				title: string;
				price: number;
				category: string;
				imageUrl: string | null;
				properties: Record<string, string[]>;
			}

			// Group properties by item and organize by filter_slug
			const itemsMap: Map<number, ItemWithProperties> = new Map();

			userItemsWithFilters.forEach((row) => {
				if (!itemsMap.has(row.id)) {
					// Initialize the item with empty properties object
					itemsMap.set(row.id, {
						id: row.id,
						title: row.title,
						price: row.price,
						category: row.category,
						imageUrl: row.imageUrl,
						properties: {},
					});
				}

				// Add filter value to the appropriate filter_slug array
				if (row.filter_slug) {
					const item = itemsMap.get(row.id);

					if (item && item.properties) {
						// Initialize the array for this filter_slug if it doesn't exist
						if (!item.properties[row.filter_slug]) {
							item.properties[row.filter_slug] = [];
						}

						// Add the filter value to the array if it's not already there
						if (row.filter_value && !item.properties[row.filter_slug]!.includes(row.filter_value)) {
							item.properties[row.filter_slug]!.push(row.filter_value);
						}
					}
				}
			});

			const itemsArray = Array.from(itemsMap.values());

			return c.json(itemsArray, 200);
		} catch (error) {
			console.log(error);

			return c.json(
				{
					message: 'Error, cant retrieve profile items',
				},
				500,
			);
		}
	});
