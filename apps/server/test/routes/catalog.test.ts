import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { createCatalogFixture } from '../fixtures/catalog';

type CatalogFixtureIds = {
	childId: number;
	parentId: number;
	propertyId: number;
	mappingId: number;
	cityId: number;
};

type CategoryResponse = Array<{ id: number; name: string }>;
type SubcategoryResponse = Array<{ id: number; name: string }>;
type PropertyResponse = Array<{ id: number; name: string }>;
type PropertyOptionsResponse = Array<{
	id: number;
	options: Array<{ id: number; value: boolean | number | string | null }>;
}>;
type LocationSearchResponse = Array<{ id: number; name: string }>;
type LocationByIdResponse = { locationResponse: { id: number; name: string; stateCode: string | null } };

const successCases = [
	['GET', '/categories'],
	['GET', '/subcategories'],
	['GET', ({ childId }: CatalogFixtureIds) => `/subcategories/${childId}`],
	['GET', ({ parentId }: CatalogFixtureIds) => `/subcategories/no_parent/${parentId}`],
	['GET', ({ propertyId }: CatalogFixtureIds) => `/properties/${propertyId}`],
	['GET', ({ childId }: CatalogFixtureIds) => `/properties/subcategory_properties/${childId}`],
	['GET', ({ mappingId }: CatalogFixtureIds) => `/subcategory_properties/${mappingId}`],
	['GET', ({ childId }: CatalogFixtureIds) => `/subcategory_properties/filter/${childId}`],
	['GET', '/locations/search?locationType=city&locationName=Mil&locationCountryCode=IT'],
	['GET', ({ cityId }: CatalogFixtureIds) => `/locations/search_by_id/city/${cityId}`],
] as const;

describe('catalog and location routes', () => {
	it('serves every catalog route while hiding unpublished records and preserving falsey property values', async () => {
		const fixture = await createCatalogFixture();
		const ids: CatalogFixtureIds = {
			childId: fixture.childSubcategory.id,
			parentId: fixture.parentSubcategory.id,
			propertyId: fixture.properties.text.id,
			mappingId: fixture.mappings.text.id,
			cityId: fixture.city.id,
		};
		const responses = new Map<string, Response>();

		for (const [method, route] of successCases) {
			const path = typeof route === 'function' ? route(ids) : route;
			const response = await app.request(path, { method });
			expect(response.status, `${method} ${path}`).toBe(200);
			responses.set(path, response);
		}

		const categories = (await responses.get('/categories')!.json()) as CategoryResponse;
		const subcategories = (await responses.get('/subcategories')!.json()) as SubcategoryResponse;
		const child = (await responses.get(`/subcategories/${ids.childId}`)!.json()) as SubcategoryResponse;
		const parent = (await responses.get(`/subcategories/no_parent/${ids.parentId}`)!.json()) as SubcategoryResponse;
		const property = (await responses.get(`/properties/${ids.propertyId}`)!.json()) as PropertyResponse;
		const properties = (await responses
			.get(`/properties/subcategory_properties/${ids.childId}`)!
			.json()) as PropertyOptionsResponse;
		const mapping = (await responses.get(`/subcategory_properties/${ids.mappingId}`)!.json()) as Array<{
			property_id: number;
			subcategory_id: number;
		}>;
		const filters = (await responses.get(`/subcategory_properties/filter/${ids.childId}`)!.json()) as Array<{
			id: number;
			name: string;
		}>;
		const locations = (await responses
			.get('/locations/search?locationType=city&locationName=Mil&locationCountryCode=IT')!
			.json()) as LocationSearchResponse;
		const location = (await responses
			.get(`/locations/search_by_id/city/${ids.cityId}`)!
			.json()) as LocationByIdResponse;

		expect(categories).toContainEqual(
			expect.objectContaining({ id: fixture.publishedCategory.id, name: fixture.publishedCategory.name }),
		);
		expect(categories.map(({ id }) => id)).not.toContain(fixture.unpublishedCategory.id);
		expect(subcategories.map(({ id }) => id)).toContain(fixture.childSubcategory.id);
		expect(subcategories.map(({ id }) => id)).not.toContain(fixture.unpublishedSubcategory.id);
		expect(child).toEqual([expect.objectContaining({ id: fixture.childSubcategory.id })]);
		expect(parent).toEqual([expect.objectContaining({ id: fixture.parentSubcategory.id })]);
		expect(property).toEqual([expect.objectContaining({ id: fixture.properties.text.id })]);
		expect(mapping).toEqual([
			expect.objectContaining({
				property_id: fixture.properties.text.id,
				subcategory_id: fixture.childSubcategory.id,
			}),
		]);
		expect(filters.map(({ id }) => id)).toEqual(
			expect.arrayContaining(Object.values(fixture.properties).map(({ id }) => id)),
		);
		expect(locations).toContainEqual(expect.objectContaining({ id: fixture.city.id, name: fixture.city.name }));
		expect(location.locationResponse).toMatchObject({
			id: fixture.city.id,
			name: fixture.city.name,
			stateCode: fixture.state.state_code,
		});

		const optionValue = (propertyId: number) =>
			properties
				.find(({ id }) => id === propertyId)
				?.options.find(({ id }) => [fixture.propertyValues.numeric.id, fixture.propertyValues.boolean.id].includes(id))
				?.value;
		expect(optionValue(fixture.properties.numeric.id)).toBe(0);
		expect(optionValue(fixture.properties.boolean.id)).toBe(false);
	});

	it('returns 400 for malformed numeric catalog and location identifiers', async () => {
		await createCatalogFixture();
		const paths = [
			'/subcategories/not-a-number',
			'/subcategories/no_parent/not-a-number',
			'/properties/not-a-number',
			'/properties/subcategory_properties/not-a-number',
			'/subcategory_properties/not-a-number',
			'/subcategory_properties/filter/not-a-number',
			'/locations/search_by_id/city/not-a-number',
		];

		for (const path of paths) {
			const response = await app.request(path);
			expect(response.status, `GET ${path}`).toBe(400);
		}
	});

	it('returns 404 rather than 500 for well-formed absent catalog and location identifiers', async () => {
		const fixture = await createCatalogFixture();
		const absentId = 2_147_483_647;
		const paths = [
			`/subcategories/${absentId}`,
			`/subcategories/no_parent/${absentId}`,
			`/properties/${absentId}`,
			`/properties/subcategory_properties/${absentId}`,
			`/subcategory_properties/${absentId}`,
			`/subcategory_properties/filter/${absentId}`,
			`/locations/search_by_id/city/${absentId}`,
			`/subcategories/${fixture.unpublishedSubcategory.id}`,
		];

		for (const path of paths) {
			const response = await app.request(path);
			expect(response.status, `GET ${path}`).toBe(404);
			expect(response.status, `GET ${path}`).not.toBe(500);
		}
	});

	it('validates the required location search query and its location type', async () => {
		await createCatalogFixture();
		const paths = [
			'/locations/search?locationName=Mil',
			'/locations/search?locationType=city',
			'/locations/search?locationType=region&locationName=Mil',
		];

		for (const path of paths) {
			const response = await app.request(path);
			expect(response.status, `GET ${path}`).toBe(400);
		}
	});

	it('returns an empty successful result when no location name matches', async () => {
		await createCatalogFixture();
		const response = await app.request(
			'/locations/search?locationType=city&locationName=DefinitelyMissing&locationCountryCode=IT',
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});
});
