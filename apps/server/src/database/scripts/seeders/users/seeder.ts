import { createClient, DrizzleClient } from '../../..';
import { hashPassword } from '../../../../lib/password';
import { users } from '../../../../database/schemas/users';
import { profiles, InsertProfile } from 'src/database/schemas/profiles';
import { profileEnum, sexEnum } from '../../../../database/schemas/enumerated_types';

export const seedDatabase = async (): Promise<void> => {
	console.log('🌱 Starting database seeding...');

	const { db, client } = createClient();

	try {
		// Begin transaction
		await client.query('BEGIN');

		await seedUsers(db);

		// Commit the transaction
		await client.query('COMMIT');
		console.log('🌱 Seeding completed successfully!');
	} catch (error) {
		console.error('❌ Seeding failed:', error);
		await client.query('ROLLBACK');
		throw error;
	} finally {
		await client.end();
	}
};

async function seedUsers(db: DrizzleClient['db']) {
	// use a transaction to create profiles after users
	await db.transaction(async (tx) => {
		const users_response = await tx
			.insert(users)
			.values([
				{
					username: 'testest',
					email: 'test@test.it',
					password: await hashPassword('AsdAsd1!'),
					email_verified: false,
				},
				{
					username: 'asdasd',
					email: 'asd@asd.it',
					password: await hashPassword('AsdAsd1!'),
					email_verified: true,
				},
				{
					username: 'fullsull',
					email: 'full@full.it',
					password: await hashPassword('AsdAsd1!'),
					phone_verified: true,
					email_verified: true,
				},
			])
			.returning();

		await tx.insert(profiles).values(
			users_response.map(
				(user) =>
					({
						profile_type: 'private' as const,
						user_id: user.id,
						name: user.username,
						surname: user.username,
						birthday: new Date('1990-01-01').toISOString(),
						gender: 'male' as const,
						city: 61165,
						privacy_policy: true,
						marketing_policy: true,
					}) satisfies InsertProfile,
			),
		);

		console.log('🔍 Seed Users:', users_response.length);
	});
}
