import { inArray } from 'drizzle-orm';
import { createClient, DrizzleClient } from '../../..';
import { hashPassword } from '../../../../lib/password';
import { users } from '../../../../database/schemas/users';
import { profiles, InsertProfile } from 'src/database/schemas/profiles';
import { addresses } from 'src/database/schemas/addresses';

const USER_SEEDS = [
	{ username: 'testest', email: 'test@test.it', password: 'AsdAsd1!', email_verified: false },
	{ username: 'asdasd', email: 'asd@asd.it', password: 'AsdAsd1!', email_verified: true },
	{ username: 'fullsull', email: 'full@full.it', password: 'AsdAsd1!', phone_verified: true, email_verified: true },
] as const;

export const seedDatabase = async (): Promise<void> => {
	console.log('🌱 Starting database seeding...');

	const { db, client } = createClient();

	try {
		await seedUsers(db);

		console.log('🌱 Seeding completed successfully!');
	} catch (error) {
		console.error('❌ Seeding failed:', error);
		throw error;
	} finally {
		await client.end();
	}
};

async function seedUsers(db: DrizzleClient['db']) {
	await db.transaction(async (tx) => {
		const userNames = USER_SEEDS.map((user) => user.username);
		const insertedUsers = await tx
			.insert(users)
			.values(
				await Promise.all(USER_SEEDS.map(async (user) => ({ ...user, password: await hashPassword(user.password) }))),
			)
			.onConflictDoNothing()
			.returning();

		console.log('🔍 Seeded Users:', insertedUsers.length);

		const seededUsers = await tx.select().from(users).where(inArray(users.username, userNames));

		const insertedProfiles = await tx
			.insert(profiles)
			.values(
				seededUsers.map(
					(user) =>
						({
							profile_type: 'private' as const,
							user_id: user.id,
							name: user.username,
							surname: user.username,
							birthday: new Date('1990-01-01').toISOString(),
							gender: 'male' as const,

							privacy_policy: true,
							marketing_policy: true,
						}) satisfies InsertProfile,
				),
			)
			.onConflictDoNothing()
			.returning();

		console.log('🔍 Seeded Profiles:', insertedProfiles.length);

		const seededProfiles = await tx
			.select({ id: profiles.id, user_id: profiles.user_id })
			.from(profiles)
			.where(
				inArray(
					profiles.user_id,
					seededUsers.map((user) => user.id),
				),
			);

		const existingAddresses = await tx
			.select({ profile_id: addresses.profile_id })
			.from(addresses)
			.where(
				inArray(
					addresses.profile_id,
					seededProfiles.map((profile) => profile.id),
				),
			);
		const profilesWithAddress = new Set(existingAddresses.map((address) => address.profile_id));
		const profilesWithoutAddress = seededProfiles.filter((profile) => !profilesWithAddress.has(profile.id));

		const insertedAddresses = profilesWithoutAddress.length
			? await tx
					.insert(addresses)
					.values(
						profilesWithoutAddress.map((profile, index) => ({
							profile_id: profile.id,
							city_id: 61165,
							province_id: 10,
							street_address: `Via Roma ${index}`,
							postal_code: 10010,
							country_code: 'IT',
							phone: `+39 333 333 3333-${index}`,
							status: 'active' as const,
							civic_number: `1-${index}`,
						})),
					)
					.returning()
			: [];

		console.log('🔍 Seeded Addresses:', insertedAddresses.length);

		console.log('🌱 Finished seeding users, profiles and addresses');
	});
}
