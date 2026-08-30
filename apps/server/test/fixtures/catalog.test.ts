import { describe, expect, it } from 'vitest';

import { addAddressSchema } from '../../src/extended_schemas/addresses';
import { createAddressFixture, validAddressBody } from './addresses';
import { createCatalogFixture } from './catalog';
import { createUserFixture } from './factories';
import { getTestDatabase } from '../helpers/database';

describe('catalog fixture', () => {
	it('persists the catalog and location graph through Drizzle relations', async () => {
		const fixture = await createCatalogFixture();
		const { db } = getTestDatabase();
		const subcategory = await db.query.subcategories.findFirst({
			where: { id: fixture.childSubcategory.id },
			with: {
				category: true,
				parent: true,
				properties: {
					with: { propertyValues: true },
				},
			},
		});
		const city = await db.query.cities.findFirst({
			where: { id: fixture.city.id },
			with: { country: true, state: true },
		});

		expect(subcategory?.category?.id).toBe(fixture.publishedCategory.id);
		expect(subcategory?.parent?.id).toBe(fixture.parentSubcategory.id);
		expect(subcategory?.properties.map(({ id }) => id).sort((a, b) => a - b)).toEqual(
			Object.values(fixture.properties)
				.map(({ id }) => id)
				.sort((a, b) => a - b),
		);
		expect(subcategory?.properties.flatMap(({ propertyValues }) => propertyValues)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: fixture.propertyValues.text.id,
					value: fixture.propertyValues.text.value,
				}),
				expect.objectContaining({
					id: fixture.propertyValues.numeric.id,
					numeric_value: 0,
				}),
				expect.objectContaining({
					boolean_value: false,
					id: fixture.propertyValues.boolean.id,
				}),
			]),
		);
		expect(Object.values(fixture.mappings)).toHaveLength(3);
		expect(city).toMatchObject({
			id: 77001,
			country: { id: 107, iso2: 'IT' },
			state: { id: 77, state_code: 'MI' },
		});
	});

	it('builds schema-valid addresses and preserves the requested owner', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const otherUser = await createUserFixture();
		const body = validAddressBody();

		expect(addAddressSchema.parse(body)).toEqual(body);
		expect(body).toEqual({
			label: 'Home',
			street_address: 'Via Roma',
			civic_number: '1',
			city_id: 77001,
			province_id: 77001,
			postal_code: 20100,
			country_code: 'IT',
			status: 'inactive',
			phone: '+390212345678',
		});

		const address = await createAddressFixture(owner.profile.id, {
			label: 'Office',
			profile_id: otherUser.profile.id,
		});

		expect(address).toMatchObject({
			label: 'Office',
			profile_id: owner.profile.id,
			status: 'inactive',
			city_id: 77001,
			province_id: 77001,
		});
	});
});
