import { and, asc, eq, ne, or } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { alias } from 'drizzle-orm/pg-core';

import { profiles } from '../../database/schemas/profiles';
import { createClient } from '../../database';
import { addresses } from '../../database/schemas/addresses';
import { createRouter } from '../../lib/create-app';
import { authPath } from '../../utils/constants';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { cities } from 'src/database/schemas/cities';
import { addAddressSchema } from 'src/extended_schemas';
import { addressStatusValues } from 'src/database/schemas/enumerated_values';

export const ADDRESS_STATUS = {
	ACTIVE: 'active' as const,
	INACTIVE: 'inactive' as const,
	DELETED: 'deleted' as const,
} satisfies Record<string, (typeof addressStatusValues)[number]>;

export const addressesRoute = createRouter()
	.get(`/${authPath}/addresses_profile`, authMiddleware, async (c) => {
		try {
			const user = c.get('user');

			const { db } = createClient();

			// get user profile_id
			const [userProfile] = await db
				.select({
					id: profiles.id,
				})
				.from(profiles)
				.where(eq(profiles.user_id, user.id));

			if (!userProfile?.id) {
				return c.json({ message: 'User profile not found' }, 404);
			}

			// add city and province name to profile address
			const city = alias(cities, 'city');
			const province = alias(cities, 'province');

			const userAddress = await db
				.select({
					id: addresses.id,
					label: addresses.label,
					city_id: addresses.city_id,
					province_id: addresses.province_id,
					street_address: addresses.street_address,
					civic_number: addresses.civic_number,
					postal_code: addresses.postal_code,
					country_code: addresses.country_code,
					city_name: city.name,
					province_name: province.name,
					status: addresses.status,
					province_country_code: province.country_code,
					city_country_code: city.country_code,
					phone: addresses.phone,
				})
				.from(addresses)
				.innerJoin(city, eq(city.id, addresses.city_id))
				.innerJoin(province, eq(province.id, addresses.province_id))
				// get all addresses for the user, active and inactive
				.where(
					and(
						eq(addresses.profile_id, userProfile.id),
						or(eq(addresses.status, ADDRESS_STATUS.ACTIVE), eq(addresses.status, ADDRESS_STATUS.INACTIVE)),
					),
				)
				.orderBy(asc(addresses.id));

			if (!userAddress?.length) {
				return c.json({ message: 'User address not found' }, 404);
			}

			return c.json(userAddress, 200);
		} catch (error) {
			return c.json({ message: 'addressesRoute error' }, 500);
		}
	})
	.get(`/${authPath}/default_address`, authMiddleware, async (c) => {
		try {
			const user = c.get('user');

			const { db } = createClient();

			// Create aliases for better readability
			const cityTable = alias(cities, 'city');
			const provinceTable = alias(cities, 'province');

			// Single optimized query combining profile lookup and address retrieval
			const [defaultAddress] = await db
				.select({
					id: addresses.id,
					label: addresses.label,
					city_id: addresses.city_id,
					province_id: addresses.province_id,
					street_address: addresses.street_address,
					civic_number: addresses.civic_number,
					postal_code: addresses.postal_code,
					country_code: addresses.country_code,
					city_name: cityTable.name,
					province_name: provinceTable.name,
					province_country_code: provinceTable.country_code,
					city_country_code: cityTable.country_code,
					phone: addresses.phone,
				})
				.from(addresses)
				.innerJoin(profiles, eq(profiles.id, addresses.profile_id))
				.innerJoin(cityTable, eq(cityTable.id, addresses.city_id))
				.innerJoin(provinceTable, eq(provinceTable.id, addresses.province_id))
				.where(and(eq(profiles.user_id, user.id), eq(addresses.status, ADDRESS_STATUS.ACTIVE)))
				.limit(1);

			if (!defaultAddress) {
				return c.json({ message: 'No active address found for user' }, 404);
			}

			return c.json(defaultAddress, 200);
		} catch (error) {
			console.log('Error fetching default address:', error);
			return c.json({ message: 'Failed to fetch default address' }, 500);
		}
	})
	.post(
		`/${authPath}/add_address_to_profile`,
		authMiddleware,
		zValidator('json', addAddressSchema.omit({ address_id: true })),
		async (c) => {
			try {
				const user = c.get('user');

				const { db } = createClient();

				const values = c.req.valid('json');

				return await db.transaction(async (tx) => {
					// Fetch the user's profile
					const [profile] = await tx
						.select({ id: profiles.id, name: profiles.name, surname: profiles.surname, email: profiles.user_id })
						.from(profiles)
						.where(eq(profiles.user_id, user.id));

					if (!profile?.id) {
						return c.json({ message: 'User profile not found' }, 404);
					}

					// Check if this is the first address for the profile
					const [firstAddress] = await tx.select().from(addresses).where(eq(addresses.profile_id, profile.id));

					if (!firstAddress) values.status = ADDRESS_STATUS.ACTIVE;

					// Insert the new address and save the shipment provider address id
					const [userAddress] = await tx
						.insert(addresses)
						.values({
							profile_id: profile.id,
							...values,
						})
						.returning();

					if (!userAddress) {
						throw new Error('Failed to add address to profile');
					}

					return c.json(userAddress, 200);
				});
			} catch (error) {
				return c.json({ message: 'addressesRoute error' }, 500);
			}
		},
	)
	.put(`/${authPath}/update_address_to_profile`, authMiddleware, zValidator('json', addAddressSchema), async (c) => {
		try {
			const user = c.get('user');

			const { db } = createClient();

			const { ...values } = c.req.valid('json');

			if (!values.address_id) {
				return c.json({ message: 'Address ID is required' }, 400);
			}

			return await db.transaction(async (tx) => {
				const [profile] = await tx
					.select({ profile_id: profiles.id, name: profiles.name, surname: profiles.surname })
					.from(profiles)
					.where(eq(profiles.user_id, user.id));

				if (!profile?.profile_id) {
					return c.json({ message: 'Profile not found' }, 404);
				}

				// check if the current address is the active one and received status is "inactive"
				const [currentAddress] = await tx
					.select()
					.from(addresses)
					.where(and(eq(addresses.id, Number(values.address_id)), eq(addresses.profile_id, profile.profile_id)));

				if (currentAddress?.status === ADDRESS_STATUS.ACTIVE && values.status === ADDRESS_STATUS.INACTIVE) {
					return c.json({ message: 'You can not disable the active address' }, 400);
				}

				// make "inactive" all other addresses that not are in "deleted" status
				await tx
					.update(addresses)
					.set({ status: ADDRESS_STATUS.INACTIVE })
					.where(
						and(
							eq(addresses.profile_id, profile.profile_id),
							ne(addresses.id, Number(values.address_id)),
							ne(addresses.status, ADDRESS_STATUS.DELETED),
						),
					);

				const [userAddress] = await tx
					.update(addresses)
					.set({
						...values,
					})
					.where(and(eq(addresses.id, Number(values.address_id)), eq(addresses.profile_id, profile.profile_id)))
					.returning();

				if (!userAddress) {
					throw new Error('Failed to update address to profile');
				}

				return c.json(userAddress, 200);
			});
		} catch (error) {
			console.log('Error updating address to profile:', error);
			return c.json({ message: 'addressesRoute error' }, 500);
		}
	})
	.put(
		`/${authPath}/hide_address_from_profile`,
		authMiddleware,
		zValidator('json', addAddressSchema.pick({ address_id: true })),
		async (c) => {
			try {
				const user = c.get('user');

				const { db } = createClient();

				const { address_id } = c.req.valid('json');

				const [profile] = await db
					.select({ profile_id: profiles.id })
					.from(profiles)
					.where(eq(profiles.user_id, user.id));

				if (!profile?.profile_id) {
					return c.json({ message: 'Profile not found' }, 404);
				}

				const userAddress = await db
					.update(addresses)
					.set({ status: 'deleted' })
					.where(and(eq(addresses.id, Number(address_id)), eq(addresses.profile_id, profile.profile_id)))
					.returning({
						id: addresses.id,
					});

				if (!userAddress) {
					throw new Error('Failed to delete address to profile');
				}

				return c.json(userAddress, 200);
			} catch (error) {
				return c.json({ message: 'addressesRoute error' }, 500);
			}
		},
	);
