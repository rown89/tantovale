import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { describeRoute } from 'hono-openapi';

import { createClient } from '#database/index';
import { items, profiles_items_favorites } from '#db-schema';
import { itemStatus } from '#database/schemas/enumerated_values';
import { createRouter } from 'src/lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { authPath } from '#utils/constants';
import { favoritesOpenApi } from '../../openapi/routes';

const postgresIntegerIdSchema = z.number().int().positive().max(2_147_483_647);

export const favoritesRoute = createRouter()
	// Check if item is an user favorite
	.get(`${authPath}/check/:item_id`, describeRoute(favoritesOpenApi.check), authMiddleware, async (c) => {
		const user = c.var.user;
		const rawItemId = Number(c.req.param('item_id'));
		if (!rawItemId) return c.json({ error: 'Item id is required' }, 400);
		const itemIdResult = postgresIntegerIdSchema.safeParse(rawItemId);
		if (!itemIdResult.success) return c.json({ message: 'Invalid Item ID' }, 400);
		const item_id = itemIdResult.data;

		const { db } = createClient();

		try {
			const [itemIsFavorite] = await db
				.select({
					id: profiles_items_favorites.id,
				})
				.from(profiles_items_favorites)
				.where(
					and(eq(profiles_items_favorites.item_id, item_id), eq(profiles_items_favorites.profile_id, user.profile_id)),
				)
				.limit(1);

			return c.json(Boolean(itemIsFavorite), 200);
		} catch {
			return c.json({ message: 'Get item error' }, 500);
		}
	})
	// handle favorite (add or remove)
	.post(
		`${authPath}/handle`,
		describeRoute(favoritesOpenApi.handle),
		authMiddleware,
		zValidator(
			'json',
			z.object({
				action: z.enum(['add', 'remove']),
				item_id: postgresIntegerIdSchema,
			}),
		),
		async (c) => {
			const user = c.var.user;
			const { item_id, action } = c.req.valid('json');

			const { db } = createClient();

			try {
				const result = await db.transaction(async (tx) => {
					await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.profile_id}::integer, ${item_id}::integer)`);

					if (action === 'remove') {
						await tx
							.delete(profiles_items_favorites)
							.where(
								and(
									eq(profiles_items_favorites.profile_id, user.profile_id),
									eq(profiles_items_favorites.item_id, item_id),
								),
							);
						return { outcome: 'removed' } as const;
					}

					const [item] = await tx
						.select({ profile_id: items.profile_id })
						.from(items)
						.where(
							and(
								eq(items.id, item_id),
								eq(items.published, true),
								eq(items.status, itemStatus.AVAILABLE),
								isNull(items.deleted_at),
							),
						)
						.limit(1);

					if (!item) return { outcome: 'not-found' } as const;
					if (item.profile_id === user.profile_id) return { outcome: 'own-item' } as const;

					const [existingFavorite] = await tx
						.select({ id: profiles_items_favorites.id })
						.from(profiles_items_favorites)
						.where(
							and(
								eq(profiles_items_favorites.profile_id, user.profile_id),
								eq(profiles_items_favorites.item_id, item_id),
							),
						)
						.limit(1);

					if (!existingFavorite) {
						await tx
							.insert(profiles_items_favorites)
							.values({
								profile_id: user.profile_id,
								item_id,
							})
							.onConflictDoNothing({
								target: [profiles_items_favorites.profile_id, profiles_items_favorites.item_id],
							});
					}

					return { outcome: 'added' } as const;
				});

				if (result.outcome === 'not-found') {
					return c.json({ error: 'Item not found or not available' }, 404);
				}
				if (result.outcome === 'own-item') {
					return c.json({ error: 'You cannot favorite your own item' }, 400);
				}

				return c.json(result.outcome === 'added');
			} catch {
				return c.json(
					{
						message: '',
					},
					500,
				);
			}
		},
	);
