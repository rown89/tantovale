import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { createClient } from '../../database';
import { properties, subcategory_properties } from '../../database/schemas/schema';
import type { AppBindings } from '../../lib/types';

export const getSubcategoryPropertiesById = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	return await db
		.select({
			property_id: subcategory_properties.property_id,
			subcategory_id: subcategory_properties.subcategory_id,
		})
		.from(subcategory_properties)
		.where(eq(subcategory_properties.id, id));
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
		.where(eq(subcategory_properties.subcategory_id, id));
};
