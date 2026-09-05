import { eq, and, isNull, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { describeRoute } from 'hono-openapi';

import {
	categories,
	items,
	users,
	cities,
	properties,
	property_values,
	addresses,
	subcategories,
	items_images,
	profiles_items_favorites,
	profiles,
} from '#db-schema';

import { items_properties_values } from '../../database/schemas/items_properties_values';
import { createRouter } from '../../lib/create-app';
import { createClient } from '../../database';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { authPath } from '../../utils/constants';

import type { ItemWithProperties } from './types';
import { itemStatus } from '#database/schemas/enumerated_values';
import { itemsOpenApi } from '../../openapi/routes';

export const itemTypeSchema = z.object({
	published: z.boolean(),
});

export const itemsRoute = createRouter()
	// get logged user selling items
	.post(
		`${authPath}/user/selling_items`,
		describeRoute(itemsOpenApi.selling),
		zValidator('json', itemTypeSchema),
		authMiddleware,
		async (c) => {
		const params = c.req.valid('json');
		const user = c.var.user;
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
					image: items_images.url,
				})
				.from(items)
				.innerJoin(items_images, eq(items_images.item_id, items.id))
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.where(
					and(
						isNull(items.deleted_at),
						eq(items.published, params.published),
						eq(items.status, itemStatus.AVAILABLE),
						eq(items.profile_id, user.profile_id),
						eq(items_images.size, 'thumbnail'),
						eq(items_images.order_position, 0),
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
		},
	)
	// get all user favorite items
	.get(`${authPath}/user/favorites`, describeRoute(itemsOpenApi.favorites), authMiddleware, async (c) => {
		const user = c.var.user;

		const { db } = createClient();

		try {
			const userFavorites = await db
				.select()
				.from(profiles_items_favorites)
				.where(eq(profiles_items_favorites.profile_id, user.profile_id));

			if (userFavorites.length === 0) return c.json([], 200);

			const userFavoritesItems = await db
				.select({
					id: items.id,
					title: items.title,
					price: items.price,
					image: items_images.url,
					published: items.published,
					created_at: items.created_at,
				})
				.from(items)
				.innerJoin(items_images, eq(items_images.item_id, items.id))
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.innerJoin(categories, eq(categories.id, subcategories.category_id))
				.where(
					and(
						inArray(
							items.id,
							userFavorites.map((favorite) => favorite.item_id),
						),
						eq(items_images.size, 'thumbnail'),
						eq(items_images.order_position, 0),
						eq(items.status, itemStatus.AVAILABLE),
						eq(items.published, true),
						eq(subcategories.published, true),
						eq(categories.published, true),
						isNull(items.deleted_at),
					),
				);

			if (!userFavoritesItems.length) return c.json([], 200);

			return c.json(userFavoritesItems, 200);
		} catch {
			return c.json({}, 500);
		}
	})
	// get specific user published selling items
	.get(`/:username`, describeRoute(itemsOpenApi.byUsername), async (c) => {
		const username = c.req.param('username');

		const { db } = createClient();

		try {
			const existingUsername = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.username, username))
				.limit(1);

			if (!existingUsername.length) return c.json({ message: 'No user found' }, 404);

			const userId = Number(existingUsername?.[0]?.id);

			const city = alias(cities, 'city');
			const province = alias(cities, 'province');

			const [profile] = await db
				.select({ id: profiles.id })
				.from(profiles)
				.where(eq(profiles.user_id, userId))
				.limit(1);

			if (!profile) return c.json({ message: 'Profile not found' }, 404);

			const userItems = await db
				.select({
					id: items.id,
					title: items.title,
					price: items.price,
					category: subcategories.slug,
					city_id: city.id,
					city_name: city.name,
					province_id: province.id,
					province_name: province.name,
					property_id: properties.id,
					property_slug: properties.slug,
					property_name: properties.name,
					property_value: property_values.value,
					property_boolean_value: property_values.boolean_value,
					property_numeric_value: property_values.numeric_value,
					imageUrl: items_images.url,
				})
				.from(items)
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.innerJoin(categories, eq(categories.id, subcategories.category_id))
				.innerJoin(addresses, eq(addresses.id, items.address_id))
				.innerJoin(city, eq(city.id, addresses.city_id))
				.innerJoin(province, eq(province.id, addresses.province_id))

				.leftJoin(items_properties_values, eq(items_properties_values.item_id, items.id))
				.leftJoin(property_values, eq(property_values.id, items_properties_values.property_value_id))
				.leftJoin(properties, eq(properties.id, property_values.property_id))
				.leftJoin(
					items_images,
					and(eq(items_images.item_id, items.id), eq(items_images.order_position, 0), eq(items_images.size, 'medium')),
				)
				.where(
					and(
						eq(items.profile_id, profile.id),
						eq(items.published, true),
						eq(items.status, itemStatus.AVAILABLE),
						eq(subcategories.published, true),
						eq(categories.published, true),
						isNull(items.deleted_at),
					),
				)
				.orderBy(items.created_at);

			// Group properties by item and organize by filter_slug

			// Group properties by item and organize by filter_slug
			const itemsMap: Map<number, ItemWithProperties> = new Map();

			userItems.forEach((row) => {
				if (!itemsMap.has(row.id)) {
					// Initialize the item with empty properties object
					itemsMap.set(row.id, {
						id: row.id,
						title: row.title,
						price: row.price,
						subcategory: row.category,
						location: {
							city: {
								id: row.city_id,
								name: row.city_name,
							},
							province: {
								id: row.province_id,
								name: row.province_name,
							},
						},
						imageUrl: row.imageUrl,
						properties: {},
					});
				}

				// Add filter value to the appropriate filter_slug array
				if (row.property_slug) {
					const item = itemsMap.get(row.id);
					const projectedPropertyValue =
						row.property_value ??
						(row.property_numeric_value === null ? undefined : String(row.property_numeric_value)) ??
						(row.property_boolean_value === null ? undefined : String(row.property_boolean_value));

					if (item && item.properties) {
						// Initialize the array for this property_slug if it doesn't exist
						if (!item.properties[row.property_slug]) {
							item.properties[row.property_slug] = [];
						}

						// Add the filter value to the array if it's not already there
						if (
							projectedPropertyValue !== undefined &&
							!item.properties[row.property_slug]!.includes(projectedPropertyValue)
						) {
							item.properties[row.property_slug]!.push(projectedPropertyValue);
						}
					}
				}
			});

			const userItemsReshaped = Array.from(itemsMap.values());

			return c.json(userItemsReshaped, 200);
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
