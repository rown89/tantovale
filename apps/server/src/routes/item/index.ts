import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { env } from 'hono/adapter';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { createClient } from '../../database';
import { subcategories } from '../../database/schemas/subcategories';
import { subCategoryFilters } from '../../database/schemas/subcategory_filters';
import { createItemSchema } from '../../extended_schemas';
import { items } from '../../database/schemas/items';
import { itemsFiltersValues, InsertItemFilterValue } from '../../database/schemas/items_filter_values';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { itemsImages } from '../../database/schemas/items_images';
import { cities } from '../../database/schemas/cities';
import { filterValues } from 'src/database/schemas/filter_values';

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
						title: items.title,
						price: items.price,
						description: items.description,
						city: cities.name,
						subcategory_name: subcategories.name,
						subcategory_slug: subcategories.slug,
						property_name: filterValues.name,
						property_value: filterValues.value,
						property_boolean_value: filterValues.boolean_value,
						property_numeric_value: filterValues.numeric_value,
					},
				})
				.from(items)
				.innerJoin(subcategories, eq(subcategories.id, items.subcategory_id))
				.innerJoin(cities, eq(cities.id, items.city))
				.innerJoin(itemsFiltersValues, eq(itemsFiltersValues.item_id, items.id))
				.innerJoin(filterValues, eq(itemsFiltersValues.filter_value_id, filterValues.id))
				.where(eq(items.id, id));

			console.log('item', item);

			const itemImages = await db
				.select({ url: itemsImages.url })
				.from(itemsImages)
				.where(and(eq(itemsImages.item_id, id), eq(itemsImages.size, 'original')));

			if (!item) throw new Error('No item found');

			const mergedItem = {
				id: item.item.id,
				title: item.item.title,
				price: item.item.price,
				description: item.item.description,
				city: item.item.city,
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

			const { commons, properties } = c.req.valid('json');

			// Auth TOKEN
			const accessToken = getCookie(c, 'access_token');

			let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);

			const user_id = Number(payload.id);

			if (!user_id) return c.json({ message: 'Invalid user identifier' }, 400);

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

				// Handle item properties(filters) if provided
				if (properties?.length) {
					// Get valid filters for this subcategory
					const subcategoryFilters = await tx
						.select()
						.from(subCategoryFilters)
						.where(eq(subCategoryFilters.subcategory_id, commons.subcategory_id));

					const validFilterIds = new Set(subcategoryFilters.map((f) => f.filter_id));

					// Validate all properties exist
					const invalidProperties = properties.filter((p) => !validFilterIds.has(p.id));

					if (invalidProperties.length) {
						throw new Error('Some properties have invalid filter IDs');
					}

					const reshapedProperties: InsertItemFilterValue[] = [];

					// Reshape properties to match the database schema

					properties.map((p) => {
						// Check if the filter contains an array of values
						// If so, map through the values and create an object for each
						// Otherwise, create a single object
						if (Array.isArray(p.value)) {
							p.value.map((v) => {
								reshapedProperties.push({
									item_id: newItem.id,
									filter_value_id: Number(v),
								});
							});
						} else {
							reshapedProperties.push({
								item_id: newItem.id,
								filter_value_id: Number(p.value),
							});
						}
					});

					console.log(reshapedProperties);

					// Insert filter values
					await tx.insert(itemsFiltersValues).values(reshapedProperties);
				} else {
					// Check if the selected subcategory has mandatory properties
					const mandatoryFilters = await tx
						.select()
						.from(subCategoryFilters)
						.where(
							and(
								eq(subCategoryFilters.subcategory_id, commons.subcategory_id),
								eq(subCategoryFilters.on_item_create_required, true),
							),
						);

					if (mandatoryFilters.length > 0) {
						throw new Error(`This subcategory requires ${mandatoryFilters.length} mandatory properties`);
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
