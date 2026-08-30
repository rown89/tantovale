import { randomUUID } from 'node:crypto';

import { profiles, users } from '../../src/database/schemas/schema';
import { hashPassword } from '../../src/lib/password';
import { getTestDatabase } from '../helpers/database';

/* eslint-disable turbo/no-undeclared-env-vars -- Vitest supplies the isolated worker identifier. */
let sequence = 0;
const nonce = randomUUID().slice(0, 8);

export type CreateUserFixtureOptions = {
	user?: Partial<typeof users.$inferInsert>;
	profile?: Partial<typeof profiles.$inferInsert>;
	password?: string;
	emailVerified?: boolean;
};

export function uniqueValue(prefix: string): string {
	sequence += 1;
	return `${prefix}-${process.env.VITEST_POOL_ID ?? '1'}-${nonce}-${sequence}`;
}

export async function createUserFixture(options: CreateUserFixtureOptions = {}) {
	const { db } = getTestDatabase();
	const suffix = uniqueValue('user');
	const password = options.password ?? 'StrongPass123!';
	const hashedPassword = await hashPassword(password);

	return db.transaction(async (tx) => {
		const [user] = await tx
			.insert(users)
			.values({
				username: suffix,
				email: `${suffix}@tantovale.test`,
				...options.user,
				password: hashedPassword,
				email_verified: options.emailVerified ?? true,
			})
			.returning();

		if (!user) {
			throw new Error('User fixture insert failed');
		}

		const [profile] = await tx
			.insert(profiles)
			.values({
				name: 'Test',
				surname: 'User',
				gender: 'female',
				privacy_policy: true,
				marketing_policy: false,
				...options.profile,
				user_id: user.id,
			})
			.returning();

		if (!profile) {
			throw new Error('Profile fixture insert failed');
		}

		return { user, profile, password };
	});
}
