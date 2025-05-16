import { and, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';

import { createClient } from '../../database';
import { subcategories } from '../../database/schemas/schema';

import type { AppBindings } from '../../lib/types';

export const getSubcategories = async (c: Context<AppBindings>) => {
	const { db } = createClient();

	return await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
			category_id: subcategories.category_id,
			parent_id: subcategories.parent_id,
		})
		.from(subcategories);
};

export const getSubcategoriesById = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	return await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
			slug: subcategories.slug,
			is_payable: subcategories.is_payable,
			is_shippable: subcategories.is_shippable,
		})
		.from(subcategories)
		.where(eq(subcategories.id, Number(id)));
};

export const getSubcategoriesWithoutParentById = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	return await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
		})
		.from(subcategories)
		.where(and(isNull(subcategories.parent_id), eq(subcategories.id, Number(id))));
};
