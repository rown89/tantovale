import { eq, and } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';

import { createClient } from '../../database';
import { subcategories } from '../../database/schemas/subcategories';
import { subcategory_properties } from '../../database/schemas/subcategory_properties';
import { createItemSchema } from '../../extended_schemas';
import { items } from '../../database/schemas/items';
import { items_properties_values, InsertItemPropertyValue } from '../../database/schemas/items_properties_values';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { items_images } from '../../database/schemas/items_images';
import { cities } from '../../database/schemas/cities';
import { property_values } from '../../database/schemas/properties_values';
import { users } from '../../database/schemas/users';

export const itemRoute = createRouter()
	.get('/:id', async (c) => {
		const id = Number(c.req.param('id'));

		if (!id) return c.json({ error: 'item id is required' }, 400);
		if (isNaN(id)) return c.json({ message: 'Invalid item ID' }, 400);

		const { db } = createClient();

		try {
			const [item] = await db
				.select({
					item: {
						id: items.id,
						user_id: users.id,
						username: users.username,
						title: items.title,
						price: items.price,
						description: items.description,
						city: cities.name,
						easy_pay: items.easy_pay,
						subcategory_name: subcategories.name,
						subcategory_slug: subcategories.slug,
						property_name: property_values.name,
						property_value: property_values.value,
						property_boolean_value: property_values.boolean_value,
						property_numeric_value: property_values.numeric_value,
					},
				})
				.from(items)
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.innerJoin(cities, eq(cities.id, items.city))
				.innerJoin(items_properties_values, eq(items_properties_values.item_id, items.id))
				.innerJoin(property_values, eq(items_properties_values.property_value_id, property_values.id))
				.innerJoin(users, eq(users.id, items.user_id))
				.where(and(eq(items.id, id), eq(items.published, true)));

			const itemImages = await db
				.select({ url: items_images.url })
				.from(items_images)
				.where(and(eq(items_images.item_id, id), eq(items_images.size, 'original')));

			if (!item) throw new Error('No item found');

			const mergedItem = {
				id: item.item.id,
				user: {
					id: item.item.user_id,
					username: item.item.username,
				},
				title: item.item.title,
				price: item.item.price,
				description: item.item.description,
				city: item.item.city,
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
			const { ACCESS_TOKEN_SECRET } = env<{
				ACCESS_TOKEN_SECRET: string;
			}>(c);

			const { commons, properties, shipping_price } = c.req.valid('json');

			// Auth TOKEN
			const accessToken = getCookie(c, 'access_token');

			let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);

			const user_id = Number(payload.id);

			if (!user_id) return c.json({ message: 'Invalid user identifier' }, 400);

			const hasDeliveryMethod = properties?.some((p) => p.slug === 'delivery_method');

			// if property value delivery_method is "shipping" and shipping_price is not provided, return error
			if (hasDeliveryMethod && shipping_price) return c.json({ message: 'Shipping price is required' }, 400);

			// if property value delivery_method is "pickup" and shipping_price is provided, return error
			if (hasDeliveryMethod && !shipping_price) return c.json({ message: 'Shipping price is not allowed' }, 400);

			const { db } = createClient();

			// Validate subcategory exists
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

			// TODO: CHECK WITH AI IF COMMONS VALUES CONTAINS MATURE OR POTENTIAL INVALID CONTENT

			return await db.transaction(async (tx) => {
				// Create the new item
				const [newItem] = await tx
					.insert(items)
					.values({
						...commons,
						user_id,
						status: 'available',
						published: true,
					})
					.returning();

				if (!newItem?.id) {
					throw new Error('Failed to create item');
				}

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
						.where(and(eq(items.id, id), eq(items.user_id, user_id)))
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
						.where(and(eq(items.id, id), eq(items.user_id, user_id)))
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
/*
  // usefull for future admin panel
  .delete(`/${authPath}/delete/:id`, authMiddleware, async (c) => {
    const { ACCESS_TOKEN_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
    }>(c);

    const id = Number(c.req.param("id"));

    if (!id) return c.json({ error: "item id is required" }, 400);
    if (isNaN(id)) return c.json({ message: "Invalid item ID" }, 400);

    const accessToken = getCookie(c, "access_token");
    let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
    const user_id = Number(payload.id);

    if (!user_id) return c.json({ message: "Invalid user id" }, 401);

    const { db } = createClient();

    try {
      await db.transaction(async (tx) => {
        // First check if the item exists and belongs to the user
        const itemExists = await tx
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.id, id), eq(items.user_id, user_id)))
          .limit(1)
          .then((results) => results[0]);

        if (!itemExists) {
          return c.json(
            {
              message:
                "Item not found or you don't have permission to delete it",
            },
            404,
          );
        }

        // delete the item
        const [deletedItem] = await db
          .delete(items)
          .where(eq(items.id, id))
          .returning();

        if (!deletedItem?.id) {
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
          message: "Item deleted successfully",
          id,
        },
        200,
      );
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof Error
              ? error.message
              : `Failed to delete item ${id}`,
        },
        500,
      );
    }
  }); 
*/
