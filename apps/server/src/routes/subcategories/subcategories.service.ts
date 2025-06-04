import { and, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';

import { createClient } from '../../database';
import { subcategories } from '../../database/schemas/schema';

import type { AppBindings } from '../../lib/types';

export const getSubcategories = async (c: Context<AppBindings>) => {
	const { db } = createClient();

	const subcategories_ = await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
			category_id: subcategories.category_id,
			parent_id: subcategories.parent_id,
			menu_order: subcategories.menu_order,
		})
		.from(subcategories)
		.where(eq(subcategories.published, true));

	return subcategories_;
};

export const getSubcategoriesById = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	const subcategories_ = await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
			slug: subcategories.slug,
			easy_pay: subcategories.easy_pay,
			menu_order: subcategories.menu_order,
		})
		.from(subcategories)
		.where(and(eq(subcategories.id, id), eq(subcategories.published, true)));

	return subcategories_;
};

export const getSubcategoriesWithoutParentById = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	const subcategories_ = await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
		})
		.from(subcategories)
		.where(and(isNull(subcategories.parent_id), eq(subcategories.id, id), eq(subcategories.published, true)));

	return subcategories_;
};
