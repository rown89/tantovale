import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { addresses } from '../../src/database/schemas/schema';
import { validAddressBody } from '../fixtures/addresses';
import { createCatalogFixture } from '../fixtures/catalog';
import { createUserFixture } from '../fixtures/factories';
import { authenticatedRequest, loginAs } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import type { CookieJar } from '../helpers/request';
import { jsonRequest } from '../helpers/request';

type AddressResponse = typeof addresses.$inferSelect;

async function addAddress(jar: CookieJar, overrides: Partial<ReturnType<typeof validAddressBody>> = {}) {
	const response = await authenticatedRequest('/addresses/auth/add_address_to_profile', 'POST', jar, {
		...validAddressBody(),
		...overrides,
	});
	const body = (await response.json()) as AddressResponse;

	expect(response.status).toBe(200);
	return body;
}

async function storedAddresses(profileId: number) {
	const { db } = getTestDatabase();
	return db.select().from(addresses).where(eq(addresses.profile_id, profileId)).orderBy(asc(addresses.id));
}

describe('address routes', () => {
	it('requires authentication for all five address operations', async () => {
		const body = validAddressBody();
		const responses = await Promise.all([
			app.request('/addresses/auth/addresses_profile'),
			app.request('/addresses/auth/default_address'),
			app.request('/addresses/auth/add_address_to_profile', jsonRequest('POST', body)),
			app.request('/addresses/auth/update_address_to_profile', jsonRequest('PUT', { ...body, address_id: 1 })),
			app.request('/addresses/auth/hide_address_from_profile', jsonRequest('PUT', { address_id: 1 })),
		]);

		expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401, 401]);
	});

	it('forces the first address active, atomically replaces it, and lists only visible addresses in ID order', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const ownerJar = await loginAs(owner);

		const first = await addAddress(ownerJar, { label: 'First', status: 'inactive' });
		expect(first.status).toBe('active');

		const second = await addAddress(ownerJar, { label: 'Second', status: 'active' });
		const afterReplacement = await storedAddresses(owner.profile.id);
		expect(afterReplacement).toEqual([
			expect.objectContaining({ id: first.id, status: 'inactive' }),
			expect.objectContaining({ id: second.id, status: 'active' }),
		]);

		const listResponse = await authenticatedRequest('/addresses/auth/addresses_profile', 'GET', ownerJar);
		const list = (await listResponse.json()) as AddressResponse[];
		const defaultResponse = await authenticatedRequest('/addresses/auth/default_address', 'GET', ownerJar);

		expect(listResponse.status).toBe(200);
		expect(list.map(({ id, status }) => ({ id, status }))).toEqual([
			{ id: first.id, status: 'inactive' },
			{ id: second.id, status: 'active' },
		]);
		expect(defaultResponse.status).toBe(200);
		expect(await defaultResponse.json()).toMatchObject({ id: second.id, label: 'Second' });

		const hideResponse = await authenticatedRequest('/addresses/auth/hide_address_from_profile', 'PUT', ownerJar, {
			address_id: first.id,
		});
		expect(hideResponse.status).toBe(200);
		expect(await hideResponse.json()).toEqual({ id: first.id });

		const visibleResponse = await authenticatedRequest('/addresses/auth/addresses_profile', 'GET', ownerJar);
		expect(visibleResponse.status).toBe(200);
		expect((await visibleResponse.json()) as AddressResponse[]).toEqual([
			expect.objectContaining({ id: second.id, status: 'active' }),
		]);
		expect(await storedAddresses(owner.profile.id)).toEqual([
			expect.objectContaining({ id: first.id, status: 'deleted' }),
			expect.objectContaining({ id: second.id, status: 'active' }),
		]);
	});

	it('uses owner-scoped updates and leaves both users unchanged after a cross-owner attempt', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const other = await createUserFixture();
		const ownerJar = await loginAs(owner);
		const otherJar = await loginAs(other);
		const ownerAddress = await addAddress(ownerJar, { label: 'Owner address' });
		const otherAddress = await addAddress(otherJar, { label: 'Other address' });

		const response = await authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', otherJar, {
			...validAddressBody(),
			address_id: ownerAddress.id,
			label: 'Hijacked',
			status: 'active',
		});
		const ownerListResponse = await authenticatedRequest('/addresses/auth/addresses_profile', 'GET', ownerJar);
		const ownerDefaultResponse = await authenticatedRequest('/addresses/auth/default_address', 'GET', ownerJar);
		const otherListResponse = await authenticatedRequest('/addresses/auth/addresses_profile', 'GET', otherJar);
		const otherDefaultResponse = await authenticatedRequest('/addresses/auth/default_address', 'GET', otherJar);
		const crossOwnerHideResponse = await authenticatedRequest(
			'/addresses/auth/hide_address_from_profile',
			'PUT',
			otherJar,
			{ address_id: ownerAddress.id },
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ message: 'Address not found' });
		expect(ownerListResponse.status).toBe(200);
		expect(((await ownerListResponse.json()) as AddressResponse[]).map(({ id }) => id)).toEqual([ownerAddress.id]);
		expect(ownerDefaultResponse.status).toBe(200);
		expect(await ownerDefaultResponse.json()).toMatchObject({ id: ownerAddress.id });
		expect(otherListResponse.status).toBe(200);
		expect(((await otherListResponse.json()) as AddressResponse[]).map(({ id }) => id)).toEqual([otherAddress.id]);
		expect(otherDefaultResponse.status).toBe(200);
		expect(await otherDefaultResponse.json()).toMatchObject({ id: otherAddress.id });
		expect(crossOwnerHideResponse.status).toBe(404);
		expect(await crossOwnerHideResponse.json()).toEqual({ message: 'Address not found' });
		expect(await storedAddresses(owner.profile.id)).toEqual([
			expect.objectContaining({ id: ownerAddress.id, label: 'Owner address', status: 'active' }),
		]);
		expect(await storedAddresses(other.profile.id)).toEqual([
			expect.objectContaining({ id: otherAddress.id, label: 'Other address', status: 'active' }),
		]);
	});

	it('never resurrects a deleted address through either active or inactive updates', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const jar = await loginAs(owner);
		const active = await addAddress(jar, { label: 'Active' });
		const deletedActiveCandidate = await addAddress(jar, { label: 'Deleted active candidate', status: 'inactive' });
		const deletedInactiveCandidate = await addAddress(jar, {
			label: 'Deleted inactive candidate',
			status: 'inactive',
		});

		for (const addressId of [deletedActiveCandidate.id, deletedInactiveCandidate.id]) {
			const hideResponse = await authenticatedRequest('/addresses/auth/hide_address_from_profile', 'PUT', jar, {
				address_id: addressId,
			});
			expect(hideResponse.status).toBe(200);
		}

		const activeUpdate = await authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', jar, {
			...validAddressBody(),
			address_id: deletedActiveCandidate.id,
			label: 'Resurrected active',
			status: 'active',
		});
		const inactiveUpdate = await authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', jar, {
			...validAddressBody(),
			address_id: deletedInactiveCandidate.id,
			label: 'Resurrected inactive',
			status: 'inactive',
		});

		expect(activeUpdate.status).toBe(404);
		expect(await activeUpdate.json()).toEqual({ message: 'Address not found' });
		expect(inactiveUpdate.status).toBe(404);
		expect(await inactiveUpdate.json()).toEqual({ message: 'Address not found' });
		expect(await storedAddresses(owner.profile.id)).toEqual([
			expect.objectContaining({ id: active.id, label: 'Active', status: 'active' }),
			expect.objectContaining({ id: deletedActiveCandidate.id, label: 'Deleted active candidate', status: 'deleted' }),
			expect.objectContaining({
				id: deletedInactiveCandidate.id,
				label: 'Deleted inactive candidate',
				status: 'deleted',
			}),
		]);
	});

	it('serializes concurrent first-address creation so both requests succeed with exactly one active row', async () => {
		await createCatalogFixture();
		const owners = await Promise.all(Array.from({ length: 6 }, () => createUserFixture()));
		const sessions = await Promise.all(owners.map((owner) => loginAs(owner)));

		const responsePairs = await Promise.all(
			sessions.map((jar, ownerIndex) =>
				Promise.all(
					['A', 'B'].map((suffix) =>
						authenticatedRequest('/addresses/auth/add_address_to_profile', 'POST', jar, {
							...validAddressBody(),
							label: `Concurrent ${ownerIndex}-${suffix}`,
							status: 'inactive',
						}),
					),
				),
			),
		);

		for (const [ownerIndex, responses] of responsePairs.entries()) {
			expect(
				responses.map(({ status }) => status),
				`concurrent first-address responses for owner ${ownerIndex}`,
			).toEqual([200, 200]);
			const rows = await storedAddresses(owners[ownerIndex]!.profile.id);
			expect(rows).toHaveLength(2);
			expect(rows.filter(({ status }) => status === 'active')).toHaveLength(1);
		}
	});

	it('serializes concurrent active switches without errors, deadlocks, or multiple active rows', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const jar = await loginAs(owner);
		const first = await addAddress(jar, { label: 'First' });
		const second = await addAddress(jar, { label: 'Second', status: 'inactive' });
		const third = await addAddress(jar, { label: 'Third', status: 'inactive' });

		const responses = await Promise.all(
			[second, third].map((candidate) =>
				authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', jar, {
					...validAddressBody(),
					address_id: candidate.id,
					label: candidate.label,
					status: 'active',
				}),
			),
		);
		const rows = await storedAddresses(owner.profile.id);

		expect(responses.map(({ status }) => status)).toEqual([200, 200]);
		expect(rows).toHaveLength(3);
		expect(rows.filter(({ status }) => status === 'active')).toHaveLength(1);
		expect(rows.find(({ id }) => id === first.id)).toMatchObject({ status: 'inactive' });
	});

	it('rejects absent city and province references without inserting or demoting an address', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const jar = await loginAs(owner);
		const missingLocationId = 2_147_483_647;

		for (const overrides of [{ city_id: missingLocationId }, { province_id: missingLocationId }]) {
			const response = await authenticatedRequest('/addresses/auth/add_address_to_profile', 'POST', jar, {
				...validAddressBody(),
				...overrides,
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ message: 'Location not found' });
		}
		expect(await storedAddresses(owner.profile.id)).toEqual([]);

		const active = await addAddress(jar, { label: 'Active' });
		const inactive = await addAddress(jar, { label: 'Inactive', status: 'inactive' });
		for (const overrides of [{ city_id: missingLocationId }, { province_id: missingLocationId }]) {
			const response = await authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', jar, {
				...validAddressBody(),
				address_id: inactive.id,
				label: 'Invalid location update',
				status: 'active',
				...overrides,
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ message: 'Location not found' });
		}

		expect(await storedAddresses(owner.profile.id)).toEqual([
			expect.objectContaining({ id: active.id, label: 'Active', status: 'active' }),
			expect.objectContaining({ id: inactive.id, label: 'Inactive', status: 'inactive' }),
		]);
	});

	it('rejects direct changes to the active address and switches active addresses transactionally', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const jar = await loginAs(owner);
		const first = await addAddress(jar, { label: 'First' });
		const second = await addAddress(jar, { label: 'Second', status: 'inactive' });

		const demoteResponse = await authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', jar, {
			...validAddressBody(),
			address_id: first.id,
			label: first.label,
			status: 'inactive',
		});
		const hideActiveResponse = await authenticatedRequest('/addresses/auth/hide_address_from_profile', 'PUT', jar, {
			address_id: first.id,
		});

		expect(demoteResponse.status).toBe(400);
		expect(await demoteResponse.json()).toEqual({ message: 'You can not disable the active address' });
		expect(hideActiveResponse.status).toBe(400);
		expect(await hideActiveResponse.json()).toEqual({ message: 'You can not delete the active address' });
		expect(await storedAddresses(owner.profile.id)).toEqual([
			expect.objectContaining({ id: first.id, status: 'active' }),
			expect.objectContaining({ id: second.id, status: 'inactive' }),
		]);

		const switchResponse = await authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', jar, {
			...validAddressBody(),
			address_id: second.id,
			label: second.label,
			status: 'active',
		});

		expect(switchResponse.status).toBe(200);
		expect(await switchResponse.json()).toMatchObject({ id: second.id, status: 'active' });
		expect(await storedAddresses(owner.profile.id)).toEqual([
			expect.objectContaining({ id: first.id, status: 'inactive' }),
			expect.objectContaining({ id: second.id, status: 'active' }),
		]);
	});

	it('returns 404 for repeated hide and unknown owner-scoped update without mutating the active row', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const jar = await loginAs(owner);
		const active = await addAddress(jar, { label: 'Active' });
		const inactive = await addAddress(jar, { label: 'Inactive', status: 'inactive' });

		const firstHide = await authenticatedRequest('/addresses/auth/hide_address_from_profile', 'PUT', jar, {
			address_id: inactive.id,
		});
		const repeatedHide = await authenticatedRequest('/addresses/auth/hide_address_from_profile', 'PUT', jar, {
			address_id: inactive.id,
		});
		const unknownHide = await authenticatedRequest('/addresses/auth/hide_address_from_profile', 'PUT', jar, {
			address_id: 2_147_483_647,
		});
		const unknownUpdate = await authenticatedRequest('/addresses/auth/update_address_to_profile', 'PUT', jar, {
			...validAddressBody(),
			address_id: 2_147_483_647,
			label: 'Unknown',
			status: 'active',
		});

		expect(firstHide.status).toBe(200);
		expect(repeatedHide.status).toBe(404);
		expect(unknownHide.status).toBe(404);
		expect(unknownUpdate.status).toBe(404);
		expect(await unknownUpdate.json()).toEqual({ message: 'Address not found' });
		expect(await storedAddresses(owner.profile.id)).toEqual([
			expect.objectContaining({ id: active.id, label: 'Active', status: 'active' }),
			expect.objectContaining({ id: inactive.id, status: 'deleted' }),
		]);
	});

	it('returns 400 for missing and invalid mutation payloads', async () => {
		await createCatalogFixture();
		const owner = await createUserFixture();
		const jar = await loginAs(owner);
		const body = validAddressBody();
		const cases: Array<[string, 'POST' | 'PUT', unknown]> = [
			['/addresses/auth/add_address_to_profile', 'POST', {}],
			['/addresses/auth/add_address_to_profile', 'POST', { ...body, city_id: 0 }],
			['/addresses/auth/update_address_to_profile', 'PUT', body],
			['/addresses/auth/update_address_to_profile', 'PUT', { ...body, address_id: 1, status: 'deleted' }],
			['/addresses/auth/hide_address_from_profile', 'PUT', {}],
			['/addresses/auth/hide_address_from_profile', 'PUT', { address_id: 'not-a-number' }],
		];

		for (const [path, method, payload] of cases) {
			const response = await authenticatedRequest(path, method, jar, payload);
			expect(response.status, `${method} ${path}`).toBe(400);
		}

		expect(await storedAddresses(owner.profile.id)).toEqual([]);
	});
});
