import { eq, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';

import { createClient } from '#database/index';
import {
	subcategories,
	subcategory_properties,
	items,
	cities,
	users,
	addresses,
	items_images,
	property_values,
	profiles,
	orders,
} from '#db-schema';
import { items_properties_values, InsertItemPropertyValue } from '#database/schemas/items_properties_values';
import { itemStatus } from '#database/schemas/enumerated_values';
import { createRouter } from '#lib/create-app';
import { authPath } from '#utils/constants';
import { createItemSchema } from '#extended_schemas';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { itemDetailResponseType } from '#extended_schemas';
import { PaymentProviderService } from '../payments/payment-provider.service';

export const itemRoute = createRouter()
	.get('/:id', async (c) => {
		const id = Number(c.req.param('id'));

		if (!id) return c.json({ error: 'item id is required' }, 400);
		if (isNaN(id)) return c.json({ message: 'Invalid item ID' }, 400);

		const { db } = createClient();

		const city = alias(cities, 'city');
		const province = alias(cities, 'province');

		try {
			const [item] = await db
				.select({
					item: {
						id: items.id,
						profile_id: profiles.id,
						username: users.username,
						title: items.title,
						price: items.price,
						description: items.description,
						city_id: city.id,
						city_name: city.name,
						province_id: province.id,
						province_name: province.name,
						easy_pay: items.easy_pay,
						subcategory_name: subcategories.name,
						subcategory_slug: subcategories.slug,
						property_name: property_values.name,
						property_value: property_values.value,
						property_boolean_value: property_values.boolean_value,
						property_numeric_value: property_values.numeric_value,
						order_id: orders.id,
					},
				})
				.from(items)
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.innerJoin(addresses, eq(addresses.id, items.address_id))
				.innerJoin(city, eq(city.id, addresses.city_id))
				.innerJoin(province, eq(province.id, addresses.province_id))
				.innerJoin(items_properties_values, eq(items_properties_values.item_id, items.id))
				.innerJoin(property_values, eq(items_properties_values.property_value_id, property_values.id))
				.innerJoin(profiles, eq(profiles.id, items.profile_id))
				.innerJoin(users, eq(users.id, profiles.user_id))
				.leftJoin(orders, eq(orders.item_id, items.id))
				.where(and(eq(items.id, id), eq(items.published, true)));

			const itemImages = await db
				.select({ url: items_images.url })
				.from(items_images)
				.where(and(eq(items_images.item_id, id), eq(items_images.size, 'original')));

			if (!item) throw new Error('No item found');

			const mergedItem: itemDetailResponseType = {
				id: item.item.id,
				user: {
					id: item.item.profile_id,
					username: item.item.username,
				},
				title: item.item.title,
				price: item.item.price,
				description: item.item.description,
				order: {
					id: item.item.order_id,
				},
				location: {
					city: {
						id: item.item.city_id,
						name: item.item.city_name,
					},
					province: {
						id: item.item.province_id,
						name: item.item.province_name,
					},
				},
				easy_pay: item.item.easy_pay,
				subcategory: {
					name: item?.item.subcategory_name,
					slug: item?.item.subcategory_slug,
				},
				images: itemImages.map((item) => item.url),
			};

			return c.json(mergedItem, 200);
		} catch (error) {
			console.log(error);
			return c.json({ message: 'Get item error' }, 500);
		}
	})
	.post(`/${authPath}/new`, authMiddleware, zValidator('json', createItemSchema), async (c) => {
		try {
			const user = c.var.user;

			const { commons, properties, shipping } = c.req.valid('json');

			const hasDeliveryMethod = properties?.find((p) => p.slug === 'delivery_method');

			// if property value delivery_method is "shipping" and shipping_price is not provided, return error
			if (hasDeliveryMethod && hasDeliveryMethod.value === 'shipping' && !shipping?.shipping_price) {
				return c.json({ message: 'Shipping price is required' }, 400);
			}

			// if property value delivery_method is "pickup" and shipping_price is provided, return error
			if (hasDeliveryMethod && hasDeliveryMethod.value === 'pickup' && shipping?.shipping_price) {
				return c.json({ message: 'Shipping price is not allowed' }, 400);
			}

			const { db } = createClient();

			// Check if the subcategory exists
			const availableSubcategory = await db
				.select()
				.from(subcategories)
				.where(eq(subcategories.id, commons.subcategory_id))
				.limit(1)
				.then((results) => results[0]);

			if (!availableSubcategory) {
				return c.json(
					{
						message: `Subcategory with ID ${commons.subcategory_id} doesn't exist`,
					},
					400,
				);
			}

			/* TODO: CHECK WITH AI IF COMMONS VALUES CONTAINS MATURE OR POTENTIAL INAPPROPRIATE CONTENT */

			return await db.transaction(async (tx) => {
				// get the profile id of the logged user
				const [profile] = await tx
					.select({
						name: profiles.name,
						surname: profiles.surname,
						payment_provider_id: profiles.payment_provider_id,
					})
					.from(profiles)
					.where(eq(profiles.id, user.profile_id))
					.limit(1);

				if (!profile) return c.json({ message: 'Profile not found' }, 404);

				// If item has easyPay, we need to check if the user has a payment_provider_id
				if (commons.easy_pay && !profile.payment_provider_id) {
					// get the active address from the user
					const [address] = await tx
						.select({ country_code: addresses.country_code })
						.from(addresses)
						.where(eq(addresses.status, 'active'))
						.limit(1);

					if (!address) return c.json({ message: 'Address not found' }, 404);

					// create a new payment provider guest user
					const paymentProviderService = new PaymentProviderService();

					const paymentProviderId = await paymentProviderService.createGuestUser({
						id: user.profile_id,
						email: user.email,
						first_name: profile.name,
						last_name: profile.surname,
						country_code: address.country_code,
						tos_acceptance: {
							unix_timestamp: Math.floor(new Date().getTime() / 1000),
							ip: c.req.raw.headers.get('x-forwarded-for') || '127.0.0.1',
						},
					});

					if (!paymentProviderId) return c.json({ message: 'Failed to create payment provider guest user' }, 500);

					await tx
						.update(profiles)
						.set({ payment_provider_id: paymentProviderId.id })
						.where(eq(profiles.id, user.profile_id));
				}

				// Check if delivery_method is "pickup"
				const isPickup = properties?.some((p) => p.slug === 'delivery_method' && p.value === 'pickup');

				// Create the new item
				const [newItem] = await tx
					.insert(items)
					.values({
						...commons,
						profile_id: user.profile_id,
						status: itemStatus.AVAILABLE,
						...(hasDeliveryMethod && !isPickup && shipping
							? {
									custom_shipping_price: shipping?.shipping_price,
									item_weight: shipping?.item_weight,
									item_length: shipping?.item_length,
									item_width: shipping?.item_width,
									item_height: shipping?.item_height,
								}
							: {}),
						published: true,
					})
					.returning();

				if (!newItem?.id) {
					throw new Error('Failed to create item');
				}

				// TODO: CONVERT PROPERTY VALUES TO NUMBERS

				// Handle item properties(properties) if provided
				if (properties?.length) {
					// Get valid properties for this subcategory
					const subcategoryProperties = await tx
						.select()
						.from(subcategory_properties)
						.where(eq(subcategory_properties.subcategory_id, commons.subcategory_id));

					const validPropertyIds = new Set(subcategoryProperties.map((p) => p.property_id));

					// Validate all properties exist
					const invalidProperties = properties.filter((p) => !validPropertyIds.has(p.id));

					if (invalidProperties.length) {
						throw new Error('Some properties have invalid property IDs');
					}

					const reshapedProperties: InsertItemPropertyValue[] = [];

					// Reshape properties to match the database schema
					properties.map((p) => {
						// Check if the property contains an array of values
						// If so, map through the values and create an object for each
						// Otherwise, create a single object
						if (Array.isArray(p.value)) {
							p.value.map((v) => {
								reshapedProperties.push({
									item_id: newItem.id,
									property_value_id: Number(v),
								});
							});
						} else {
							reshapedProperties.push({
								item_id: newItem.id,
								property_value_id: Number(p.value),
							});
						}
					});

					// Insert property values
					await tx.insert(items_properties_values).values(reshapedProperties);
				} else {
					// Check if the selected subcategory has mandatory properties
					const mandatoryProperties = await tx
						.select()
						.from(subcategory_properties)
						.where(
							and(
								eq(subcategory_properties.subcategory_id, commons.subcategory_id),
								eq(subcategory_properties.on_item_create_required, true),
							),
						);

					if (mandatoryProperties.length > 0) {
						throw new Error(`This subcategory requires ${mandatoryProperties.length} mandatory properties`);
					}
				}

				// Return the created item
				return c.json(
					{
						message: 'Item created successfully',
						item_id: newItem.id,
					},
					201,
				);
			});
		} catch (error) {
			console.error('Error creating item:', error);
			return c.json(
				{
					message: error instanceof Error ? error.message : 'Failed to create item',
				},
				400,
			);
		}
	})
	.put(`/${authPath}/edit/:id`, authMiddleware, async (c) => {
		return c.json({});
	})
	.post(
		`/${authPath}/user_delete_item`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				id: z.number(),
			}),
		),
		async (c) => {
			const { ACCESS_TOKEN_SECRET } = env<{
				ACCESS_TOKEN_SECRET: string;
			}>(c);

			const { id } = c.req.valid('json');

			const accessToken = getCookie(c, 'access_token');
			let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
			const user_id = Number(payload.id);

			if (!user_id) return c.json({ message: 'Invalid user id' }, 401);

			const { db } = createClient();

			try {
				await db.transaction(async (tx) => {
					// First check if the item exists and belongs to the user
					const itemExists = await tx
						.select({ id: items.id })
						.from(items)
						.innerJoin(profiles, eq(profiles.id, items.profile_id))
						.where(and(eq(items.id, id), eq(profiles.user_id, user_id)))
						.limit(1)
						.then((results) => results[0]);

					if (!itemExists) {
						return c.json(
							{
								message: "Item not found or you don't have permission to delete it",
							},
							404,
						);
					}

					// unpublish and set user_deleted:true item
					const [updatedItem] = await db
						.update(items)
						.set({
							published: false,
							deleted_at: new Date(),
						})
						.where(eq(items.id, id))
						.returning();

					if (!updatedItem?.id) {
						return c.json(
							{
								message: `Item ${id} cant be deleted because doesn't exist.`,
								id,
							},
							401,
						);
					}
				});

				return c.json(
					{
						message: 'Item deleted successfully',
						id,
					},
					200,
				);
			} catch (error) {
				return c.json(
					{
						message: error instanceof Error ? error.message : `Failed to delete item ${id}`,
					},
					500,
				);
			}
		},
	)
	.post(
		`/${authPath}/publish_state`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				id: z.number(),
				published: z.boolean(),
			}),
		),
		async (c) => {
			const { ACCESS_TOKEN_SECRET } = env<{
				ACCESS_TOKEN_SECRET: string;
			}>(c);

			const { id, published } = c.req.valid('json');

			const accessToken = getCookie(c, 'access_token');
			let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
			const user_id = Number(payload.id);

			if (!user_id) return c.json({ message: 'Invalid user id' }, 401);

			const { db } = createClient();
			try {
				await db.transaction(async (tx) => {
					// First check if the item exists and belongs to the user
					const itemExists = await tx
						.select({ id: items.id })
						.from(items)
						.innerJoin(profiles, eq(profiles.id, items.profile_id))
						.where(and(eq(items.id, id), eq(profiles.user_id, user_id)))
						.limit(1)
						.then((results) => results[0]);

					if (!itemExists) {
						return c.json(
							{
								message: "Item not found or you don't have permission to delete it",
							},
							404,
						);
					}

					// unpublish item
					const [updatedItem] = await db
						.update(items)
						.set({
							published,
						})
						.where(eq(items.id, id))
						.returning();

					if (!updatedItem?.id) {
						return c.json(
							{
								message: `Item ${id} cant be deleted because doesn't exist.`,
								id,
							},
							401,
						);
					}
				});

				return c.json(
					{
						message: 'Item deleted successfully',
						id,
					},
					200,
				);
			} catch (error) {
				return c.json(
					{
						message: error instanceof Error ? error.message : `Failed to delete item ${id}`,
					},
					500,
				);
			}
		},
	);
