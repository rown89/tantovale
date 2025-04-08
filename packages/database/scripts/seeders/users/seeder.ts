import { createClient, DrizzleClient } from '../../../';
import { hashPassword } from '../../../../../apps/server/src/lib/password';
import { users } from '@workspace/database/schemas/users';

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
	// Query to get human-readable subcategory-filter relationships
	const users_response = await db
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

	console.log('🔍 Seed Users:', users_response.length);
}
