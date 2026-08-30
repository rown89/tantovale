import {
	categories,
	cities,
	countries,
	properties,
	property_values,
	states,
	subcategories,
	subcategory_properties,
} from '../../src/database/schemas/schema';
import { getTestDatabase } from '../helpers/database';
import { uniqueValue } from './factories';

function requireInserted<Row>(row: Row | undefined, label: string): Row {
	if (!row) {
		throw new Error(`${label} fixture insert failed`);
	}

	return row;
}

export async function createCatalogFixture() {
	const { db } = getTestDatabase();
	const suffix = uniqueValue('catalog');

	return db.transaction(async (tx) => {
		const [countryRow] = await tx
			.insert(countries)
			.values({ id: 107, name: 'Italy', iso3: 'ITA', iso2: 'IT', phonecode: '39' })
			.returning();
		const country = requireInserted(countryRow, 'Country');
		const [stateRow] = await tx
			.insert(states)
			.values({
				id: 77,
				name: 'Milano',
				country_id: country.id,
				country_code: country.iso2,
				state_code: 'MI',
			})
			.returning();
		const state = requireInserted(stateRow, 'State');
		const [cityRow] = await tx
			.insert(cities)
			.values({
				id: 77001,
				name: 'Milano',
				state_id: state.id,
				state_code: state.state_code ?? 'MI',
				country_id: country.id,
				country_code: country.iso2,
				latitude: '45.46420000',
				longitude: '9.19000000',
			})
			.returning();
		const city = requireInserted(cityRow, 'City');

		const [publishedCategoryRow, unpublishedCategoryRow] = await tx
			.insert(categories)
			.values([
				{
					name: `Published Category ${suffix}`,
					slug: `published-category-${suffix}`,
					published: true,
				},
				{
					name: `Unpublished Category ${suffix}`,
					slug: `unpublished-category-${suffix}`,
					published: false,
				},
			])
			.returning();
		const publishedCategory = requireInserted(publishedCategoryRow, 'Published category');
		const unpublishedCategory = requireInserted(unpublishedCategoryRow, 'Unpublished category');

		const [parentSubcategoryRow] = await tx
			.insert(subcategories)
			.values({
				name: `Published Parent ${suffix}`,
				slug: `published-parent-${suffix}`,
				category_id: publishedCategory.id,
				published: true,
			})
			.returning();
		const parentSubcategory = requireInserted(parentSubcategoryRow, 'Parent subcategory');
		const [childSubcategoryRow, unpublishedSubcategoryRow] = await tx
			.insert(subcategories)
			.values([
				{
					name: `Published Child ${suffix}`,
					slug: `published-child-${suffix}`,
					category_id: publishedCategory.id,
					parent_id: parentSubcategory.id,
					easy_pay: true,
					published: true,
				},
				{
					name: `Unpublished Subcategory ${suffix}`,
					slug: `unpublished-subcategory-${suffix}`,
					category_id: unpublishedCategory.id,
					published: false,
				},
			])
			.returning();
		const childSubcategory = requireInserted(childSubcategoryRow, 'Child subcategory');
		const unpublishedSubcategory = requireInserted(unpublishedSubcategoryRow, 'Unpublished subcategory');

		const [textPropertyRow, numericPropertyRow, booleanPropertyRow] = await tx
			.insert(properties)
			.values([
				{ name: `Text Property ${suffix}`, slug: `text-property-${suffix}`, type: 'select' },
				{ name: `Numeric Property ${suffix}`, slug: `numeric-property-${suffix}`, type: 'number' },
				{ name: `Boolean Property ${suffix}`, slug: `boolean-property-${suffix}`, type: 'boolean' },
			])
			.returning();
		const fixtureProperties = {
			text: requireInserted(textPropertyRow, 'Text property'),
			numeric: requireInserted(numericPropertyRow, 'Numeric property'),
			boolean: requireInserted(booleanPropertyRow, 'Boolean property'),
		};

		const [textMappingRow, numericMappingRow, booleanMappingRow] = await tx
			.insert(subcategory_properties)
			.values(
				Object.values(fixtureProperties).map((property, position) => ({
					property_id: property.id,
					subcategory_id: childSubcategory.id,
					position,
					on_item_create_required: true,
				})),
			)
			.returning();
		const mappings = {
			text: requireInserted(textMappingRow, 'Text property mapping'),
			numeric: requireInserted(numericMappingRow, 'Numeric property mapping'),
			boolean: requireInserted(booleanMappingRow, 'Boolean property mapping'),
		};

		const [textValueRow, numericValueRow, booleanValueRow] = await tx
			.insert(property_values)
			.values([
				{ property_id: fixtureProperties.text.id, name: 'Cotton', value: 'cotton' },
				{
					property_id: fixtureProperties.numeric.id,
					name: 'Zero',
					value: '0',
					numeric_value: 0,
				},
				{ property_id: fixtureProperties.boolean.id, name: 'False', boolean_value: false },
			])
			.returning();
		const propertyValues = {
			text: requireInserted(textValueRow, 'Text property value'),
			numeric: requireInserted(numericValueRow, 'Numeric property value'),
			boolean: requireInserted(booleanValueRow, 'Boolean property value'),
		};

		return {
			country,
			state,
			city,
			publishedCategory,
			unpublishedCategory,
			parentSubcategory,
			childSubcategory,
			unpublishedSubcategory,
			properties: fixtureProperties,
			mappings,
			propertyValues,
		};
	});
}

export type CatalogFixture = Awaited<ReturnType<typeof createCatalogFixture>>;
