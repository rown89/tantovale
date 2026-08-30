import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import { items, items_images } from '../../src/database/schemas/schema';
import { s3Client } from '../../src/lib/s3client';
import { environment } from '../../src/utils/constants';
import { createCommerceActors, createItemFixture } from '../fixtures/commerce';
import { getTestDatabase } from '../helpers/database';
import { createTestObjectStorageClient } from '../helpers/object-storage';
import type { CookieJar } from '../helpers/request';

const bucket = environment.AWS_BUCKET_NAME;
const endpoint = environment.AWS_ENDPOINT;
if (!bucket || !endpoint) throw new Error('Missing worker-local object storage configuration');
const storage = createTestObjectStorageClient(bucket, endpoint);

let pngBuffer: Buffer;

beforeAll(async () => {
	pngBuffer = await sharp({
		create: {
			width: 32,
			height: 32,
			channels: 4,
			background: { r: 37, g: 99, b: 235, alpha: 1 },
		},
	})
		.png()
		.toBuffer();
});

afterAll(() => {
	storage.destroy();
});

function imageFile(name = 'listing.png'): File {
	return new File([pngBuffer], name, { type: 'image/png' });
}

function nonImageClaimingPng(name = 'fake.png'): File {
	return new File(['not an image'], name, { type: 'image/png' });
}

function uploadForm(itemId?: string, files: File[] = []): FormData {
	const form = new FormData();
	if (itemId !== undefined) form.set('item_id', itemId);
	for (const file of files) form.append('images', file);
	return form;
}

function uploadRequest(jar: CookieJar, form: FormData): Promise<Response> {
	return Promise.resolve(
		app.request('/uploads/auth/images-item', {
			method: 'POST',
			headers: { cookie: jar.header() },
			body: form,
		}),
	);
}

async function objectKeys(): Promise<string[]> {
	const response = await storage.send(new ListObjectsV2Command({ Bucket: bucket }));
	return (response.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : [])).sort();
}

async function imageRows(itemId?: number) {
	const { db } = getTestDatabase();
	const query = db.select().from(items_images).orderBy(asc(items_images.order_position), asc(items_images.size));
	return itemId === undefined ? query : query.where(eq(items_images.item_id, itemId));
}

async function expectNoUploadResidue(itemId?: number): Promise<void> {
	expect(await objectKeys()).toEqual([]);
	expect(await imageRows(itemId)).toEqual([]);
}

describe('POST /uploads/auth/images-item', () => {
	it('stores four correctly associated variants in MinIO and the database for each source image', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await uploadRequest(
			actors.seller.jar,
			uploadForm(String(item.id), [imageFile('front.png'), imageFile('back.png')]),
		);

		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({ item_id: String(item.id) });

		const keys = await objectKeys();
		expect(keys).toHaveLength(8);
		expect(keys).toEqual(
			expect.arrayContaining([
				expect.stringMatching(new RegExp(`^images/items/${item.id}/full/front_original_\\d+\\.png$`)),
				expect.stringMatching(new RegExp(`^images/items/${item.id}/full/front_medium_\\d+\\.png$`)),
				expect.stringMatching(new RegExp(`^images/items/${item.id}/full/front_small_\\d+\\.png$`)),
				expect.stringMatching(new RegExp(`^images/items/${item.id}/thumbs/front_\\d+_thumb\\.png$`)),
				expect.stringMatching(new RegExp(`^images/items/${item.id}/full/back_original_\\d+\\.png$`)),
				expect.stringMatching(new RegExp(`^images/items/${item.id}/full/back_medium_\\d+\\.png$`)),
				expect.stringMatching(new RegExp(`^images/items/${item.id}/full/back_small_\\d+\\.png$`)),
				expect.stringMatching(new RegExp(`^images/items/${item.id}/thumbs/back_\\d+_thumb\\.png$`)),
			]),
		);

		for (const key of keys) {
			const metadata = await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
			expect(metadata.ContentType).toBe('image/png');
		}

		const rows = await imageRows(item.id);
		expect(rows).toHaveLength(8);
		expect(rows.map(({ item_id }) => item_id)).toEqual(Array(8).fill(item.id));
		expect(rows.map(({ order_position }) => order_position).sort()).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
		expect(rows.map(({ size }) => size).sort()).toEqual([
			'medium',
			'medium',
			'original',
			'original',
			'small',
			'small',
			'thumbnail',
			'thumbnail',
		]);
		expect(rows.map(({ url }) => new URL(url).pathname.slice(1)).sort()).toEqual(keys);
	});

	it.each([
		['the image field is missing', (itemId: number) => uploadForm(String(itemId))],
		['the item ID field is missing', () => uploadForm(undefined, [imageFile()])],
	])('returns 400 and writes nothing when %s', async (_case, makeForm) => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await uploadRequest(actors.seller.jar, makeForm(item.id));

		expect(response.status).toBe(400);
		await expectNoUploadResidue(item.id);
	});

	it('returns 400 and writes nothing for a non-image payload even when its MIME type claims PNG', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [nonImageClaimingPng()]));

		expect(response.status).toBe(400);
		await expectNoUploadResidue(item.id);
	});

	it('returns 400 and writes nothing for a file over the 3 MiB limit', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const oversized = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'oversized.png', { type: 'image/png' });
		const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [oversized]));

		expect(response.status).toBe(400);
		await expectNoUploadResidue(item.id);
	});

	it.each(['not-a-number', '0', '-1', '2147483648'])(
		'returns 400 and writes nothing for malformed item ID %s',
		async (itemId) => {
			const actors = await createCommerceActors();
			const response = await uploadRequest(actors.seller.jar, uploadForm(itemId, [imageFile()]));

			expect(response.status).toBe(400);
			await expectNoUploadResidue();
		},
	);

	it('returns 404 before image processing when the item belongs to another profile', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await uploadRequest(actors.buyer.jar, uploadForm(String(item.id), [nonImageClaimingPng()]));

		expect(response.status).toBe(404);
		await expectNoUploadResidue(item.id);
	});

	it('returns 404 before image processing when the item does not exist', async () => {
		const actors = await createCommerceActors();
		const response = await uploadRequest(actors.seller.jar, uploadForm('2147483647', [nonImageClaimingPng()]));

		expect(response.status).toBe(404);
		await expectNoUploadResidue();
	});

	it('deletes earlier objects when a later MinIO write fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let putCount = 0;
		const middlewareName = `fail-third-upload-${item.id}`;
		s3Client.middlewareStack.add(
			(next, context) => async (args) => {
				if (context.commandName === 'PutObjectCommand') {
					putCount += 1;
					if (putCount === 3) throw new Error('Injected third object upload failure');
				}
				return next(args);
			},
			{ name: middlewareName, step: 'initialize', priority: 'high' },
		);

		try {
			const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [imageFile()]));
			expect(response.status).toBe(500);
			expect(putCount).toBe(3);
			await expectNoUploadResidue(item.id);
		} finally {
			s3Client.middlewareStack.remove(middlewareName);
			consoleError.mockRestore();
		}
	});

	it('deletes all objects when the database insert fails after the uploads', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let putCount = 0;
		const middlewareName = `delete-item-after-upload-${item.id}`;
		s3Client.middlewareStack.add(
			(next, context) => async (args) => {
				const result = await next(args);
				if (context.commandName === 'PutObjectCommand') {
					putCount += 1;
					if (putCount === 4) {
						const { db } = getTestDatabase();
						await db.delete(items).where(eq(items.id, item.id));
					}
				}
				return result;
			},
			{ name: middlewareName, step: 'initialize', priority: 'high' },
		);

		try {
			const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [imageFile()]));
			expect(response.status).toBe(500);
			expect(putCount).toBe(4);
			await expectNoUploadResidue(item.id);
		} finally {
			s3Client.middlewareStack.remove(middlewareName);
			consoleError.mockRestore();
		}
	});
});
