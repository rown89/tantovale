import { randomUUID } from 'node:crypto';
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../src/database/schemas/users';
import { environment } from '../../src/utils/constants';
import { getTestDatabase } from '../helpers/database';
import { createTestObjectStorageClient } from '../helpers/object-storage';

describe('worker state isolation', () => {
	const { db } = getTestDatabase();
	const storage = createTestObjectStorageClient();
	const bucket = environment.AWS_BUCKET_NAME;
	let residueKey = '';
	let residueUsername = '';
	let residueEmail = '';

	beforeEach(async () => {
		const existingUsers = await db.select().from(users);
		const listed = await storage.send(new ListObjectsV2Command({ Bucket: bucket }));

		expect(existingUsers).toEqual([]);
		expect(listed.Contents ?? []).toEqual([]);

		const id = randomUUID();
		residueKey = `isolation/${id}.txt`;
		residueUsername = `isolation-${id}`;
		residueEmail = `${id}@tantovale.test`;
		await db.insert(users).values({
			username: residueUsername,
			email: residueEmail,
			password: 'not-a-login-password',
		});
		await storage.send(new PutObjectCommand({ Bucket: bucket, Key: residueKey, Body: 'residue' }));
	});

	afterAll(() => {
		storage.destroy();
	});

	async function expectCurrentResidue(): Promise<void> {
		const currentUsers = await db.select().from(users);
		expect(currentUsers).toHaveLength(1);
		expect(currentUsers[0]).toMatchObject({ username: residueUsername, email: residueEmail });

		const listed = await storage.send(new ListObjectsV2Command({ Bucket: bucket }));
		expect(listed.Contents?.map(({ Key }) => Key)).toEqual([residueKey]);
	}

	it('retains only its own database and object-storage residue', async () => {
		await expectCurrentResidue();
	});

	it('retains only its own database and object-storage residue', async () => {
		await expectCurrentResidue();
	});
});
