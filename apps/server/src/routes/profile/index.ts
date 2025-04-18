import { count, eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

import { createClient } from '../../database';
import { cities, items, itemsImages, profiles, users } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { UserSchema } from '../../extended_schemas/users';
import { authPath } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';

export const profileRoute = createRouter()
	// get authenticated user
	.get(`/${authPath}`, authMiddleware, async (c) => {
		const user = c.var.user;

		const { db } = createClient();

		const [userProfileData] = await db
			.select({
				username: users.username,
				email: users.email,
				fullname: profiles.fullname,
				gender: profiles.gender,
				city: {
					id: cities.id,
					name: cities.name,
				},
			})
			.from(users)
			.innerJoin(profiles, eq(users.id, profiles.user_id))
			.innerJoin(cities, eq(cities.id, profiles.city))
			.where(eq(users.id, user.id))
			.limit(1);

		if (!userProfileData) {
			return c.json({ message: 'Profile not found' }, 404);
		}

		return c.json(userProfileData, 200);
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
				})
				.from(users)
				.innerJoin(profiles, eq(users.id, profiles.user_id))
				.where(eq(users.username, username))
				.limit(1);

			if (!userData) return c.json({ message: 'User not found' }, 404);

			const [profileData] = await db
				.select({
					selling_items: count(),
					city_id: cities.id,
					city_name: cities.name,
				})
				.from(items)
				.innerJoin(profiles, eq(profiles.user_id, userData.id))
				.innerJoin(cities, eq(cities.id, profiles.city))
				.where(eq(profiles.user_id, userData.id))
				.groupBy(cities.id);

			if (!profileData) return c.json({ message: 'Profile not found' }, 404);

			const data = {
				...userData,
				...profileData,
				city: {
					id: profileData.city_id,
					name: profileData.city_name,
				},
			};

			return c.json(data, 200);
		} catch (error) {
			console.log(error);
			return c.json(
				{
					message: 'Failed to fetch user profile',
				},
				500,
			);
		}
	})
	.put(
		`/${authPath}`,
		authMiddleware,
		zValidator(
			'json',
			UserSchema.pick({
				fullname: true,
				gender: true,
				city: true,
			}),
		),
		async (c) => {
			const user = c.var.user;
			const values = await c.req.valid('json');

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
				if (error instanceof z.ZodError) {
					return c.json(
						{
							message: 'Validation error',
							errors: error.errors,
						},
						400,
					);
				}

				console.error('Profile update error:', error);
				return c.json({ message: 'Failed to update profile' }, 500);
			}
		},
	);
