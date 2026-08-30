import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { cities, items, profiles } from '../../src/database/schemas/schema';
import { createAddressFixture } from '../fixtures/addresses';
import { createCatalogFixture } from '../fixtures/catalog';
import { createUserFixture, uniqueValue } from '../fixtures/factories';
import { authenticatedRequest, loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { jsonRequest } from '../helpers/request';

async function createDistinctProvince() {
	const catalog = await createCatalogFixture();
	const { db } = getTestDatabase();
	const [province] = await db
		.insert(cities)
		.values({
			id: 77002,
			name: 'Milano Province',
			state_id: catalog.state.id,
			state_code: catalog.state.state_code ?? 'MI',
			country_id: catalog.country.id,
			country_code: catalog.country.iso2,
			latitude: '45.50000000',
			longitude: '9.20000000',
		})
		.returning();

	if (!province) {
		throw new Error('Province fixture insert failed');
	}

	return { catalog, province };
}

describe('profile routes', () => {
	it('requires authentication for every protected profile operation', async () => {
		const responses = await Promise.all([
			app.request('/profile/auth'),
			app.request('/profile/auth/profile_active_address_id'),
			app.request('/profile/auth', jsonRequest('PUT', { name: 'Mario', surname: 'Rossi', gender: 'male' })),
		]);

		expect(responses.map(({ status }) => status)).toEqual([401, 401, 401]);
	});

	it('returns no full profile and a null active address id until an active address exists', async () => {
		const fixture = await createUserFixture();
		const jar = await loginAs(fixture);

		const profileResponse = await authenticatedRequest('/profile/auth', 'GET', jar);
		const activeAddressResponse = await authenticatedRequest('/profile/auth/profile_active_address_id', 'GET', jar);

		expect(profileResponse.status).toBe(404);
		expect(await profileResponse.json()).toEqual({ message: 'Profile not found' });
		expect(activeAddressResponse.status).toBe(200);
		expect(await activeAddressResponse.json()).toBeNull();
	});

	it('returns the active address id and joins the correct city and province into the full profile', async () => {
		const { catalog, province } = await createDistinctProvince();
		const fixture = await createUserFixture();
		const address = await createAddressFixture(fixture.profile.id, {
			city_id: catalog.city.id,
			province_id: province.id,
			status: 'active',
		});
		const jar = await loginAs(fixture);

		const activeAddressResponse = await authenticatedRequest('/profile/auth/profile_active_address_id', 'GET', jar);
		const profileResponse = await authenticatedRequest('/profile/auth', 'GET', jar);

		expect(activeAddressResponse.status).toBe(200);
		expect(await activeAddressResponse.json()).toBe(address.id);
		expect(profileResponse.status).toBe(200);
		expect(await profileResponse.json()).toMatchObject({
			username: fixture.user.username,
			email: fixture.user.email,
			name: fixture.profile.name,
			surname: fixture.profile.surname,
			location: {
				street_address: address.street_address,
				city: catalog.city.name,
				province: province.name,
				postal_code: address.postal_code,
				country_code: address.country_code,
			},
		});
	});

	it('returns compact public data with only published items and rejects absent users or locations', async () => {
		const { catalog, province } = await createDistinctProvince();
		const fixture = await createUserFixture();
		const address = await createAddressFixture(fixture.profile.id, {
			city_id: catalog.city.id,
			province_id: province.id,
			status: 'active',
		});
		const { db } = getTestDatabase();
		await db.insert(items).values([
			{
				profile_id: fixture.profile.id,
				subcategory_id: catalog.childSubcategory.id,
				address_id: address.id,
				title: uniqueValue('published-item'),
				description: 'Published item',
				published: true,
				price: 100,
			},
			{
				profile_id: fixture.profile.id,
				subcategory_id: catalog.childSubcategory.id,
				address_id: address.id,
				title: uniqueValue('draft-item'),
				description: 'Draft item',
				published: false,
				price: 200,
			},
		]);

		const compactResponse = await app.request(`/profile/compact/${fixture.user.username}`);
		const unknownResponse = await app.request('/profile/compact/unknown-user');
		const noLocationFixture = await createUserFixture();
		const noLocationResponse = await app.request(`/profile/compact/${noLocationFixture.user.username}`);

		expect(compactResponse.status).toBe(200);
		const compact = (await compactResponse.json()) as Record<string, unknown> & {
			location: { city: Record<string, unknown>; province: Record<string, unknown> };
		};
		expect(Object.keys(compact).sort()).toEqual([
			'created_at',
			'email_verified',
			'id',
			'location',
			'phone_verified',
			'profile_id',
			'selling_items',
		]);
		expect(Object.keys(compact.location).sort()).toEqual(['city', 'province']);
		expect(Object.keys(compact.location.city).sort()).toEqual(['id', 'name']);
		expect(Object.keys(compact.location.province).sort()).toEqual(['id', 'name']);
		expect(compact).toMatchObject({
			id: fixture.user.id,
			profile_id: fixture.profile.id,
			selling_items: 1,
			location: {
				city: { id: catalog.city.id, name: catalog.city.name },
				province: { id: province.id, name: province.name },
			},
		});
		expect(compact).not.toHaveProperty('email');
		expect(compact).not.toHaveProperty('phone');
		expect(compact).not.toHaveProperty('name');
		expect(compact.location).not.toHaveProperty('street_address');
		expect(unknownResponse.status).toBe(404);
		expect(await unknownResponse.json()).toEqual({ message: 'User not found' });
		expect(noLocationResponse.status).toBe(404);
		expect(await noLocationResponse.json()).toEqual({ message: 'Profile not found' });
	});

	it('updates only the authenticated profile and rejects invalid bodies', async () => {
		const owner = await createUserFixture();
		const other = await createUserFixture();
		const jar = await loginAs(owner);
		const values = { name: 'Mario', surname: 'Rossi', gender: 'male' as const };

		const response = await authenticatedRequest('/profile/auth', 'PUT', jar, values);
		const invalidResponse = await authenticatedRequest('/profile/auth', 'PUT', jar, {
			...values,
			name: 'M',
		});
		const { db } = getTestDatabase();
		const [storedOwner] = await db.select().from(profiles).where(eq(profiles.id, owner.profile.id));
		const [storedOther] = await db.select().from(profiles).where(eq(profiles.id, other.profile.id));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject(values);
		expect(invalidResponse.status).toBe(400);
		expect(storedOwner).toMatchObject(values);
		expect(storedOther).toMatchObject({ name: other.profile.name, surname: other.profile.surname });
	});
});
