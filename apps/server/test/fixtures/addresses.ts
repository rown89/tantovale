import type { z } from 'zod/v4';

import { addresses } from '../../src/database/schemas/schema';
import { addAddressSchema } from '../../src/extended_schemas/addresses';
import { getTestDatabase } from '../helpers/database';

export type ValidAddressBody = z.infer<typeof addAddressSchema>;

export function validAddressBody(): ValidAddressBody {
	return {
		label: 'Home',
		street_address: 'Via Roma',
		civic_number: '1',
		city_id: 77001,
		// The legacy schema names this a province, but the FK intentionally targets cities.id.
		province_id: 77001,
		postal_code: 20100,
		country_code: 'IT',
		status: 'inactive',
		phone: '+390212345678',
	};
}

export async function createAddressFixture(profileId: number, overrides: Partial<typeof addresses.$inferInsert> = {}) {
	const { db } = getTestDatabase();
	const [address] = await db
		.insert(addresses)
		.values({
			...validAddressBody(),
			...overrides,
			profile_id: profileId,
		})
		.returning();

	if (!address) {
		throw new Error('Address fixture insert failed');
	}

	return address;
}
