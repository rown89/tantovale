import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { createClient } from '../../database';
import { properties, subcategories, subcategory_properties } from '../../database/schemas/schema';
import type { AppBindings } from '../../lib/types';

export const getSubcategoryPropertiesById = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	return await db
		.select({
			property_id: subcategory_properties.property_id,
			subcategory_id: subcategory_properties.subcategory_id,
		})
		.from(subcategory_properties)
		.innerJoin(subcategories, eq(subcategory_properties.subcategory_id, subcategories.id))
		.where(and(eq(subcategory_properties.id, id), eq(subcategories.published, true)));
};

export const getFiltersForSubcategory = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	return await db
		.select({
			id: properties.id,
			name: properties.name,
		})
		.from(subcategory_properties)
		.innerJoin(properties, eq(subcategory_properties.property_id, properties.id))
		.innerJoin(subcategories, eq(subcategory_properties.subcategory_id, subcategories.id))
		.where(and(eq(subcategory_properties.subcategory_id, id), eq(subcategories.published, true)));
};
