import { randomUUID } from 'node:crypto';
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { users } from '../../src/database/schemas/users';
import { environment } from '../../src/utils/constants';
import { getTestDatabase } from '../helpers/database';
import { createTestObjectStorageClient, resetObjectStorage } from '../helpers/object-storage';

describe('worker state isolation', () => {
	const { db } = getTestDatabase();
	const runtime = inject('testRuntime');
	const bucket = environment.AWS_BUCKET_NAME;
	const storage = createTestObjectStorageClient(bucket, runtime.minio.endpoint);
	let residueKey = '';
	let residueUsername = '';
	let residueEmail = '';

	beforeEach(async () => {
		const existingUsers = await db.select().from(users);
		const listed = await storage.send(new ListObjectsV2Command({ Bucket: bucket }), {
			abortSignal: AbortSignal.timeout(10_000),
		});

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
		await storage.send(new PutObjectCommand({ Bucket: bucket, Key: residueKey, Body: 'residue' }), {
			abortSignal: AbortSignal.timeout(10_000),
		});
	});

	afterAll(() => {
		storage.destroy();
	});

	async function expectCurrentResidue(): Promise<void> {
		const currentUsers = await db.select().from(users);
		expect(currentUsers).toHaveLength(1);
		expect(currentUsers[0]).toMatchObject({ username: residueUsername, email: residueEmail });

		const listed = await storage.send(new ListObjectsV2Command({ Bucket: bucket }), {
			abortSignal: AbortSignal.timeout(10_000),
		});
		expect(listed.Contents?.map(({ Key }) => Key)).toEqual([residueKey]);
	}

	it('retains only its own database and object-storage residue', async () => {
		await expectCurrentResidue();
	});

	it('retains only its own database and object-storage residue', async () => {
		await expectCurrentResidue();
	});

	it('refuses an assigned worker bucket that differs from the environment', async () => {
		const wrongBucket = runtime.resourceNames.workerBuckets.find((candidate) => candidate !== bucket);

		if (!wrongBucket) {
			throw new Error('The test runtime must provide another worker bucket for this guard check');
		}

		await expect(resetObjectStorage(wrongBucket, runtime.minio.endpoint)).rejects.toThrow(
			/does not match the assigned worker bucket/i,
		);
	});
});
