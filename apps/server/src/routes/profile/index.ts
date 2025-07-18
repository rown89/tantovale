import { count, eq, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';
import { zValidator } from '@hono/zod-validator';

import { createClient } from '../../database';
import { addresses, cities, items, profiles, users } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { UserProfileSchema } from '../../extended_schemas/users';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';

export const profileRoute = createRouter()
	// get authenticated user
	.get(`/${authPath}/info`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { db } = createClient();

		const city = alias(cities, 'city');
		const province = alias(cities, 'province');

		const [userProfileData] = await db
			.select({
				username: users.username,
				email: users.email,
				name: profiles.name,
				surname: profiles.surname,
				gender: profiles.gender,
				payment_provider_id_full: profiles.payment_provider_id_full,
				location: {
					street_address: addresses.street_address,
					city: city.name,
					province: province.name,
					postal_code: addresses.postal_code,
					country_code: addresses.country_code,
				},
			})
			.from(users)
			.innerJoin(profiles, eq(users.id, profiles.user_id))
			.innerJoin(addresses, eq(addresses.profile_id, profiles.id))
			.innerJoin(city, eq(addresses.city_id, city.id))
			.innerJoin(province, eq(addresses.province_id, province.id))
			.where(eq(users.id, user.id))
			.limit(1);

		if (!userProfileData) {
			return c.json({ message: 'Profile not found' }, 404);
		}

		return c.json(userProfileData, 200);
	})
	.get(`/${authPath}/profile_active_address_id`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { db } = createClient();

		try {
			const [userData] = await db
				.select({
					profile_id: profiles.id,
					address_id: addresses.id,
				})
				.from(profiles)
				.leftJoin(addresses, eq(addresses.profile_id, profiles.id))
				.where(and(eq(profiles.user_id, user.id), eq(addresses.status, 'active')))
				.limit(1);

			if (!userData) return c.json(null, 200);

			return c.json(userData?.address_id, 200);
		} catch (error) {
			if (error instanceof Error && error.message === 'Profile not found') {
				return c.json({ message: 'Profile not found' }, 404);
			}

			console.error('Error checking user address:', error);
			return c.json({ message: 'Failed to check address status' }, 500);
		}
	})
	// get by username (compact data)
	.get('/compact/:username', async (c) => {
		const { username } = c.req.param();

		const { db } = createClient();

		try {
			const [userData] = await db
				.select({
					id: users.id,
					phone_verified: users.phone_verified,
					email_verified: users.email_verified,
					created_at: users.created_at,
					profile_id: profiles.id,
				})
				.from(users)
				.innerJoin(profiles, eq(users.id, profiles.user_id))
				.where(eq(users.username, username))
				.limit(1);

			if (!userData) return c.json({ message: 'User not found' }, 404);

			const city = alias(cities, 'city');
			const province = alias(cities, 'province');

			// Get the user's city information
			const [cityData] = await db
				.select({
					city_id: city.id,
					city_name: city.name,
					province_id: province.id,
					province_name: province.name,
				})
				.from(profiles)
				.innerJoin(addresses, eq(addresses.profile_id, profiles.id))
				.innerJoin(city, eq(addresses.city_id, city.id))
				.innerJoin(province, eq(addresses.province_id, province.id))
				.where(eq(profiles.user_id, userData.id));

			// Get the count of selling items separately
			const [sellingItemsCount] = await db
				.select({
					count: count(),
				})
				.from(items)
				.where(and(eq(items.profile_id, userData.profile_id), eq(items.published, true)));

			if (!cityData) return c.json({ message: 'Profile not found' }, 404);

			const data = {
				...userData,
				selling_items: sellingItemsCount?.count || 0,
				location: {
					city: {
						id: cityData.city_id,
						name: cityData.city_name,
					},
					province: {
						id: cityData.province_id,
						name: cityData.province_name,
					},
				},
			};

			return c.json(data, 200);
		} catch (error) {
			return c.json({ message: 'Failed to fetch user profile' }, 500);
		}
	})
	// update profile
	.put(
		`/${authPath}`,
		authMiddleware,
		zValidator(
			'json',
			UserProfileSchema.pick({
				name: true,
				surname: true,
				gender: true,
			}),
		),
		async (c) => {
			const user = c.var.user;
			const values = c.req.valid('json');

			try {
				const { db } = createClient();

				const [updatedProfile] = await db
					.update(profiles)
					.set({
						...values,
						updated_at: new Date(),
					})
					.where(eq(profiles.user_id, Number(user.id)))
					.returning();

				if (!updatedProfile) {
					return c.json({ message: 'Profile not found' }, 404);
				}

				return c.json(updatedProfile, 200);
			} catch (error) {
				console.error('Profile update error:', error);
				return c.json({ message: 'Failed to update profile' }, 500);
			}
		},
	);
