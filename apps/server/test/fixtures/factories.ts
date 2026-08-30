import { profiles, users } from '../../src/database/schemas/schema';
import { hashPassword } from '../../src/lib/password';
import { getTestDatabase } from '../helpers/database';

/* eslint-disable turbo/no-undeclared-env-vars -- Vitest supplies the isolated worker identifier. */
let sequence = 0;

export function uniqueValue(prefix: string): string {
	sequence += 1;
	return `${prefix}-${process.env.VITEST_POOL_ID ?? '1'}-${sequence}`;
}

export async function createUserFixture(overrides: Partial<typeof users.$inferInsert> = {}) {
	const { db } = getTestDatabase();
	const suffix = uniqueValue('user');
	const password = 'StrongPass123!';
	const [user] = await db
		.insert(users)
		.values({
			username: suffix,
			email: `${suffix}@tantovale.test`,
			password: await hashPassword(password),
			email_verified: true,
			...overrides,
		})
		.returning();

	if (!user) {
		throw new Error('User fixture insert failed');
	}

	const [profile] = await db
		.insert(profiles)
		.values({
			user_id: user.id,
			name: 'Test',
			surname: 'User',
			gender: 'female',
			privacy_policy: true,
			marketing_policy: false,
		})
		.returning();

	if (!profile) {
		throw new Error('Profile fixture insert failed');
	}

	return { user, profile, password };
}
