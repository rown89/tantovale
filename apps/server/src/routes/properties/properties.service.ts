import type { Context } from 'hono';
import { eq } from 'drizzle-orm';

import { createClient } from '../../database';
import { properties } from '../../database/schemas/properties';
import { subcategory_properties } from '../../database/schemas/subcategory_properties';
import { property_values } from '../../database/schemas/properties_values';

import type { AppBindings } from '../../lib/types';

export const getPropertiesByIdService = async (c: Context<AppBindings>, id: number) => {
	try {
		const { db } = createClient();

		const propertiesList = await db
			.select()
			.from(properties)
			.where(eq(properties.id, Number(id)));

		if (!propertiesList.length) return c.json({ message: 'Missing properties' }, 500);

		return c.json(propertiesList, 200);
	} catch (error) {
		return c.json({ message: 'getPropertiesByIdService error' }, 500);
	}
};

export const getPropertiesBySubcategoryPropertiesIdService = async (c: Context<AppBindings>, id: number) => {
	const { db } = createClient();

	const propertiesRequest = await db
		.select({
			property_id: properties.id,
			property_name: properties.name,
			property_type: properties.type,
			property_slug: properties.slug,
			// property_values table
			fv_id: property_values.id,
			fv_name: property_values.name,
			fv_value: property_values.value,
			fv_number_value: property_values.numeric_value,
			fv_boolean_value: property_values.boolean_value,
			// subcategory_properties table
			on_item_create_required: subcategory_properties.on_item_create_required,
		})
		.from(subcategory_properties)
		.innerJoin(properties, eq(subcategory_properties.property_id, properties.id))
		.innerJoin(property_values, eq(property_values.property_id, properties.id))
		.where(eq(subcategory_properties.subcategory_id, id));

	type PropertyRow = (typeof propertiesRequest)[number];

	type PropertyWithValues = {
		id: PropertyRow['property_id'];
		name: PropertyRow['property_name'];
		type: PropertyRow['property_type'];
		slug: PropertyRow['property_slug'];
		on_item_create_required: PropertyRow['on_item_create_required'];
		options: Array<{
			id: PropertyRow['fv_id'];
			name: PropertyRow['fv_name'];
			value: PropertyRow['fv_value'] | PropertyRow['fv_number_value'] | PropertyRow['fv_boolean_value'];
		}>;
	};

	const propertiesLookup: Record<number, PropertyWithValues> = {};

	// Process data in a single pass
	for (const row of propertiesRequest) {
		if (!propertiesLookup[row.property_id]) {
			propertiesLookup[row.property_id] = {
				id: row.property_id,
				name: row.property_name,
				type: row.property_type,
				slug: row.property_slug,
				on_item_create_required: row.on_item_create_required,
				options: [],
			};
		}

		let value: PropertyWithValues['options'][number]['value'] = row.fv_value;

		if (row.fv_boolean_value) value = row.fv_boolean_value;
		if (row.fv_number_value) value = row.fv_number_value;

		propertiesLookup[row.property_id]?.options.push({
			id: row.fv_id,
			name: row.fv_name,
			value,
		});
	}

	// Convert object to array of values
	const propertiesWithValues: PropertyWithValues[] = Object.values(propertiesLookup);

	return propertiesWithValues;
};
