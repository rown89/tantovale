import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import { items, items_images, profiles_items_favorites } from '../../src/database/schemas/schema';
import { s3Client } from '../../src/lib/s3client';
import { environment } from '../../src/utils/constants';
import { createCommerceActors, createItemFixture } from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { createTestObjectStorageClient } from '../helpers/object-storage';
import type { CookieJar } from '../helpers/request';

const bucket = environment.AWS_BUCKET_NAME;
const endpoint = environment.AWS_ENDPOINT;
if (!bucket || !endpoint) throw new Error('Missing worker-local object storage configuration');
const storage = createTestObjectStorageClient(bucket, endpoint);

let pngBuffer: Buffer;
let jpegBuffer: Buffer;

beforeAll(async () => {
	const source = sharp({
		create: {
			width: 32,
			height: 32,
			channels: 4,
			background: { r: 37, g: 99, b: 235, alpha: 1 },
		},
	});
	[pngBuffer, jpegBuffer] = await Promise.all([source.clone().png().toBuffer(), source.clone().jpeg().toBuffer()]);
});

afterAll(() => {
	storage.destroy();
});

function imageFile(name = 'listing.png'): File {
	return new File([pngBuffer], name, { type: 'image/png' });
}

function rasterFile(contents: Buffer, name: string, type: 'image/jpeg' | 'image/png'): File {
	return new File([contents], name, { type });
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

async function objectBuffer(key: string): Promise<Buffer> {
	const response = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
	if (!response.Body) throw new Error(`Missing body for test object ${key}`);
	return Buffer.from(await response.Body.transformToByteArray());
}

async function objectDimensions(key: string): Promise<{ width: number | undefined; height: number | undefined }> {
	const { width, height } = await sharp(await objectBuffer(key)).metadata();
	return { width, height };
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
		const safeKeyPattern = new RegExp(
			`^images/items/${item.id}/(?:full|thumbs)/[0-9a-f-]{36}-[01]_(?:original|medium|small|thumbnail)\\.png$`,
		);
		expect(keys.every((key) => safeKeyPattern.test(key))).toBe(true);

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

	it('uses unique safe keys even when timestamps and hostile truncated filenames collide', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

		try {
			const response = await uploadRequest(
				actors.seller.jar,
				uploadForm(String(item.id), [imageFile('../../same.one.png?#'), imageFile('../../same.two.png?#')]),
			);
			expect(response.status).toBe(201);

			const keys = await objectKeys();
			expect(keys).toHaveLength(8);
			expect(new Set(keys).size).toBe(8);
			expect(keys.every((key) => !key.includes('same') && !/[?#]/.test(key) && !key.includes('..'))).toBe(true);
			const rows = await imageRows(item.id);
			expect(rows).toHaveLength(8);
			expect(new Set(rows.map(({ url }) => url)).size).toBe(8);
			expect(rows.map(({ url }) => new URL(url).pathname.slice(1)).sort()).toEqual(keys);
			for (const key of keys) {
				await expect(storage.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).resolves.toBeDefined();
			}
		} finally {
			now.mockRestore();
		}
	});

	it('accepts decoded JPEG and derives every object extension and content type from the bytes', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await uploadRequest(
			actors.seller.jar,
			uploadForm(String(item.id), [rasterFile(jpegBuffer, 'misleading.png', 'image/jpeg')]),
		);

		expect(response.status).toBe(201);
		const keys = await objectKeys();
		expect(keys).toHaveLength(4);
		expect(keys.every((key) => key.endsWith('.jpg'))).toBe(true);
		for (const key of keys) {
			const head = await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
			expect(head.ContentType).toBe('image/jpeg');
			expect((await sharp(await objectBuffer(key)).metadata()).format).toBe('jpeg');
		}
	});

	it('rejects a declared MIME type that disagrees with the decoded raster format', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const mismatched = new File([pngBuffer], 'claimed-jpeg.jpg', { type: 'image/jpeg' });
		const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [mismatched]));

		expect(response.status).toBe(400);
		await expectNoUploadResidue(item.id);
	});

	it('rejects decoded SVG even when the client declares PNG', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const svg = new File(
			['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>'],
			'polyglot.png',
			{ type: 'image/png' },
		);
		const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [svg]));

		expect(response.status).toBe(400);
		await expectNoUploadResidue(item.id);
	});

	it('rejects compressed rasters exceeding the decoded dimension or pixel ceilings before writing', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const [tooWide, tooManyPixels] = await Promise.all([
			sharp({ create: { width: 2001, height: 10, channels: 3, background: '#0ea5e9' } })
				.png()
				.toBuffer(),
			sharp({ create: { width: 2001, height: 2001, channels: 3, background: '#a855f7' } })
				.jpeg({ quality: 50 })
				.toBuffer(),
		]);
		expect(tooWide.byteLength).toBeLessThan(3 * 1024 * 1024);
		expect(tooManyPixels.byteLength).toBeLessThan(3 * 1024 * 1024);

		for (const file of [
			rasterFile(tooWide, 'too-wide.png', 'image/png'),
			rasterFile(tooManyPixels, 'too-many-pixels.jpg', 'image/jpeg'),
		]) {
			const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [file]));
			expect(response.status).toBe(400);
			await expectNoUploadResidue(item.id);
		}
	});

	it('fits landscape and portrait medium/small variants within both bounds without enlargement', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const [landscape, portrait] = await Promise.all([
			sharp({ create: { width: 1600, height: 400, channels: 3, background: '#ef4444' } })
				.png()
				.toBuffer(),
			sharp({ create: { width: 400, height: 1600, channels: 3, background: '#22c55e' } })
				.png()
				.toBuffer(),
		]);
		const response = await uploadRequest(
			actors.seller.jar,
			uploadForm(String(item.id), [
				rasterFile(landscape, 'landscape.png', 'image/png'),
				rasterFile(portrait, 'portrait.png', 'image/png'),
			]),
		);

		expect(response.status).toBe(201);
		const rows = await imageRows(item.id);
		const keyFor = (orderPosition: number, size: 'medium' | 'original' | 'small') => {
			const row = rows.find((candidate) => candidate.order_position === orderPosition && candidate.size === size);
			if (!row) throw new Error(`Missing ${size} row at position ${orderPosition}`);
			return new URL(row.url).pathname.slice(1);
		};

		await expect(objectDimensions(keyFor(0, 'original'))).resolves.toEqual({ width: 1600, height: 400 });
		await expect(objectDimensions(keyFor(0, 'medium'))).resolves.toEqual({ width: 800, height: 200 });
		await expect(objectDimensions(keyFor(0, 'small'))).resolves.toEqual({ width: 500, height: 125 });
		await expect(objectDimensions(keyFor(1, 'original'))).resolves.toEqual({ width: 400, height: 1600 });
		await expect(objectDimensions(keyFor(1, 'medium'))).resolves.toEqual({ width: 200, height: 800 });
		await expect(objectDimensions(keyFor(1, 'small'))).resolves.toEqual({ width: 125, height: 500 });
	});

	it('keeps five source positions unique across sequential uploads and cleans an over-capacity request', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const first = await uploadRequest(
			actors.seller.jar,
			uploadForm(String(item.id), [imageFile('first-a.png'), imageFile('first-b.png')]),
		);
		const second = await uploadRequest(
			actors.seller.jar,
			uploadForm(String(item.id), [imageFile('second-a.png'), imageFile('second-b.png'), imageFile('second-c.png')]),
		);
		const overCapacity = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [imageFile('sixth.png')]));

		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(overCapacity.status).toBe(400);
		expect((await first.json()) as { files: Array<{ orderPosition: number }> }).toMatchObject({
			files: [{ orderPosition: 0 }, { orderPosition: 1 }],
		});
		expect((await second.json()) as { files: Array<{ orderPosition: number }> }).toMatchObject({
			files: [{ orderPosition: 2 }, { orderPosition: 3 }, { orderPosition: 4 }],
		});

		const rows = await imageRows(item.id);
		expect(rows).toHaveLength(20);
		expect(rows.filter(({ size }) => size === 'original').map(({ order_position }) => order_position)).toEqual([
			0, 1, 2, 3, 4,
		]);
		for (const position of [0, 1, 2, 3, 4]) {
			expect(
				rows
					.filter(({ order_position }) => order_position === position)
					.map(({ size }) => size)
					.sort(),
			).toEqual(['medium', 'original', 'small', 'thumbnail']);
		}
		expect(await objectKeys()).toHaveLength(20);

		const positionZeroThumbnail = rows.find(({ order_position, size }) => order_position === 0 && size === 'thumbnail');
		if (!positionZeroThumbnail) throw new Error('Missing position-zero thumbnail');
		const sellingResponse = await authenticatedRequest('/items/auth/user/selling_items', 'POST', actors.seller.jar, {
			published: true,
		});
		await getTestDatabase().db.insert(profiles_items_favorites).values({
			profile_id: actors.buyer.profile.id,
			item_id: item.id,
		});
		const favoritesResponse = await authenticatedRequest('/items/auth/user/favorites', 'GET', actors.buyer.jar);
		const selling = (await sellingResponse.json()) as Array<{ id: number; image: string }>;
		const favorites = (await favoritesResponse.json()) as Array<{ id: number; image: string }>;
		expect(sellingResponse.status).toBe(200);
		expect(favoritesResponse.status).toBe(200);
		expect(selling).toEqual([expect.objectContaining({ id: item.id, image: positionZeroThumbnail.url })]);
		expect(favorites).toEqual([expect.objectContaining({ id: item.id, image: positionZeroThumbnail.url })]);
	});

	it('serializes concurrent uploads against the per-item source capacity', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const { db } = getTestDatabase();
		const sizes = ['original', 'medium', 'small', 'thumbnail'] as const;
		await db.insert(items_images).values(
			[0, 1, 2, 3].flatMap((position) =>
				sizes.map((size) => ({
					item_id: item.id,
					order_position: position,
					size,
					url: `https://fixtures.tantovale.test/${item.id}/${position}/${size}.png`,
				})),
			),
		);

		const responses = await Promise.all([
			uploadRequest(actors.seller.jar, uploadForm(String(item.id), [imageFile('concurrent-a.png')])),
			uploadRequest(actors.seller.jar, uploadForm(String(item.id), [imageFile('concurrent-b.png')])),
		]);

		expect(responses.map(({ status }) => status).sort()).toEqual([201, 400]);
		const rows = await imageRows(item.id);
		expect(rows).toHaveLength(20);
		expect(rows.filter(({ size }) => size === 'original')).toHaveLength(5);
		expect(
			rows
				.filter(({ order_position }) => order_position === 4)
				.map(({ size }) => size)
				.sort(),
		).toEqual(['medium', 'original', 'small', 'thumbnail']);
		expect(rows.filter(({ order_position, size }) => order_position === 0 && size === 'thumbnail')).toHaveLength(1);
		expect(await objectKeys()).toHaveLength(4);
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

	it('rejects more than five source images without writing objects or rows', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await uploadRequest(
			actors.seller.jar,
			uploadForm(
				String(item.id),
				Array.from({ length: 6 }, (_, index) => imageFile(`image-${index}.png`)),
			),
		);

		expect(response.status).toBe(400);
		await expectNoUploadResidue(item.id);
	});

	it('rejects an aggregate request over the upload ceiling before multipart parsing', async () => {
		const actors = await createCommerceActors();
		const response = await app.request('/uploads/auth/images-item', {
			method: 'POST',
			headers: {
				cookie: actors.seller.jar.header(),
				'content-length': String(16 * 1024 * 1024),
				'content-type': 'application/octet-stream',
			},
			body: new Uint8Array(1),
		});

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: 'Upload payload too large' });
		await expectNoUploadResidue();
	});

	it('enforces the aggregate ceiling for streamed multipart bodies without a content-length header', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const paddedSize = 3 * 1024 * 1024 + 16 * 1024;
		const paddedPng = Buffer.concat([pngBuffer, Buffer.alloc(paddedSize - pngBuffer.length)]);
		const form = uploadForm(
			String(item.id),
			Array.from({ length: 5 }, (_, index) => rasterFile(paddedPng, `large-${index}.png`, 'image/png')),
		);
		const response = await uploadRequest(actors.seller.jar, form);

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: 'Upload payload too large' });
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

	it('returns 404 before image processing when the owned item is already soft-deleted', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const { db } = getTestDatabase();
		await db.update(items).set({ deleted_at: new Date(), published: false }).where(eq(items.id, item.id));

		const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [nonImageClaimingPng()]));

		expect(response.status).toBe(404);
		await expectNoUploadResidue(item.id);
	});

	it('revalidates ownership after uploads and compensates when soft-delete wins the race', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		let putCount = 0;
		const middlewareName = `soft-delete-after-upload-${item.id}`;
		s3Client.middlewareStack.add(
			(next, context) => async (args) => {
				const result = await next(args);
				if (context.commandName === 'PutObjectCommand') {
					putCount += 1;
					if (putCount === 4) {
						const { db } = getTestDatabase();
						await db.update(items).set({ deleted_at: new Date(), published: false }).where(eq(items.id, item.id));
					}
				}
				return result;
			},
			{ name: middlewareName, step: 'initialize', priority: 'high' },
		);

		try {
			const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [imageFile()]));
			expect(response.status).toBe(404);
			expect(putCount).toBe(4);
			await expectNoUploadResidue(item.id);
		} finally {
			s3Client.middlewareStack.remove(middlewareName);
		}
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

	it('compensates an object persisted before its response fails and retries per-key cleanup when batch deletion fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let putCount = 0;
		let batchDeleteCount = 0;
		const individualDeleteAttempts = new Map<string, number>();
		const middlewareName = `persisted-response-and-cleanup-failure-${item.id}`;
		s3Client.middlewareStack.add(
			(next, context) => async (args) => {
				if (context.commandName === 'PutObjectCommand') {
					const result = await next(args);
					putCount += 1;
					if (putCount === 3) throw new Error('Injected response failure after object persistence');
					return result;
				}

				if (context.commandName === 'DeleteObjectsCommand') {
					batchDeleteCount += 1;
					throw new Error('Injected batch cleanup failure');
				}

				if (context.commandName === 'DeleteObjectCommand') {
					const key = String((args.input as { Key?: string }).Key ?? '');
					const attempt = (individualDeleteAttempts.get(key) ?? 0) + 1;
					individualDeleteAttempts.set(key, attempt);
					if (attempt === 1) throw new Error('Injected first per-key cleanup failure');
				}

				return next(args);
			},
			{ name: middlewareName, step: 'initialize', priority: 'high' },
		);

		try {
			const response = await uploadRequest(actors.seller.jar, uploadForm(String(item.id), [imageFile()]));
			expect(response.status).toBe(500);
			expect(putCount).toBe(3);
			expect(batchDeleteCount).toBe(1);
			expect([...individualDeleteAttempts.values()].sort()).toEqual([2, 2, 2]);
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
		const middlewareName = `exhaust-image-identity-after-upload-${item.id}`;
		s3Client.middlewareStack.add(
			(next, context) => async (args) => {
				const result = await next(args);
				if (context.commandName === 'PutObjectCommand') {
					putCount += 1;
					if (putCount === 4) {
						const { client } = getTestDatabase();
						await client.query("SELECT setval(pg_get_serial_sequence('public.items_images', 'id'), 2147483647, true)");
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
			const logs = consoleError.mock.calls.flat().map(String).join(' ');
			expect(logs).not.toContain('images/items');
			expect(logs).not.toContain('listing');
		} finally {
			s3Client.middlewareStack.remove(middlewareName);
			consoleError.mockRestore();
		}
	});
});
