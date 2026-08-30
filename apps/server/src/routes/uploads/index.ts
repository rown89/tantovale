import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { and, eq, isNull } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import sharp from 'sharp';

import { createClient } from '../../database';
import { items, items_images, type InsertItemImage } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { s3Client } from '../../lib/s3client';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { authPath, environment } from '../../utils/constants';

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const MAX_IMAGE_COUNT = 5;
const MAX_TOTAL_IMAGE_SIZE = MAX_IMAGE_SIZE * MAX_IMAGE_COUNT;
const MAX_MULTIPART_OVERHEAD = 64 * 1024;
const MAX_UPLOAD_BODY_SIZE = MAX_TOTAL_IMAGE_SIZE + MAX_MULTIPART_OVERHEAD;
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const CLEANUP_ATTEMPTS = 2;

type RasterFormat = 'jpeg' | 'png';

type ProcessedImage = {
	originalBuffer: Buffer;
	mediumBuffer: Buffer;
	smallBuffer: Buffer;
	thumbnailBuffer: Buffer;
	originalKey: string;
	mediumKey: string;
	smallKey: string;
	thumbKey: string;
	contentType: 'image/jpeg' | 'image/png';
	orderPosition: number;
};

class UploadItemUnavailableError extends Error {
	constructor() {
		super('Upload item is no longer available');
		this.name = 'UploadItemUnavailableError';
	}
}

function rasterAttributes(format: string | undefined):
	| {
			format: RasterFormat;
			contentType: 'image/jpeg' | 'image/png';
			extension: 'jpg' | 'png';
	  }
	| undefined {
	if (format === 'jpeg') return { format, contentType: 'image/jpeg', extension: 'jpg' };
	if (format === 'png') return { format, contentType: 'image/png', extension: 'png' };
	return undefined;
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : 'UnknownError';
}

async function deleteObjectsIndividually(bucket: string, keys: string[]): Promise<void> {
	const failures: Error[] = [];

	for (const key of keys) {
		let deleted = false;
		let lastError: unknown;
		for (let attempt = 0; attempt < CLEANUP_ATTEMPTS; attempt += 1) {
			try {
				await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
				deleted = true;
				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (!deleted) {
			failures.push(new Error(`Object cleanup failed (${errorName(lastError)})`));
		}
	}

	if (failures.length > 0) {
		throw new AggregateError(failures, `Failed to clean up ${failures.length} uploaded object(s)`);
	}
}

async function cleanUpUploadedObjects(bucket: string, keys: string[]): Promise<void> {
	const uniqueKeys = [...new Set(keys)];
	if (uniqueKeys.length === 0) return;

	let fallbackKeys: string[] = [];
	try {
		const deleted = await s3Client.send(
			new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: { Objects: uniqueKeys.map((Key) => ({ Key })) },
			}),
		);
		const errors = deleted.Errors ?? [];
		if (errors.length === 0) return;

		const failedKeys = errors.flatMap(({ Key }) => (Key ? [Key] : []));
		const requestedKeys = new Set(uniqueKeys);
		fallbackKeys =
			failedKeys.length === errors.length && failedKeys.every((key) => requestedKeys.has(key))
				? [...new Set(failedKeys)]
				: uniqueKeys;
	} catch {
		fallbackKeys = uniqueKeys;
	}

	await deleteObjectsIndividually(bucket, fallbackKeys);
}

export const uploadsRoute = createRouter().post(
	`/${authPath}/images-item`,
	bodyLimit({
		maxSize: MAX_UPLOAD_BODY_SIZE,
		onError: (c) => c.json({ error: 'Upload payload too large' }, 413),
	}),
	authMiddleware,
	async (c) => {
		let formData: Awaited<ReturnType<typeof c.req.parseBody>>;
		try {
			formData = await c.req.parseBody({ all: true, dot: true });
		} catch (error) {
			if (error instanceof Error && error.name === 'BodyLimitError') throw error;
			return c.json({ message: 'Upload images-item error' }, 400);
		}

		const { images, item_id: itemIdField } = formData;
		if (images === undefined || typeof itemIdField !== 'string') {
			return c.json({ message: 'Upload images-item error' }, 400);
		}

		const receivedImages = Array.isArray(images) ? images : [images];
		const itemId = Number(itemIdField);
		if (
			!/^[1-9]\d*$/.test(itemIdField) ||
			!Number.isSafeInteger(itemId) ||
			itemId > MAX_POSTGRES_INTEGER ||
			receivedImages.length === 0 ||
			receivedImages.length > MAX_IMAGE_COUNT
		) {
			return c.json({ message: 'Upload images-item error' }, 400);
		}

		const refinedImages: File[] = [];
		let totalImageSize = 0;
		for (const file of receivedImages) {
			if (!(file instanceof File) || (file.type !== 'image/jpeg' && file.type !== 'image/png')) {
				return c.json({ error: 'Invalid file type' }, 400);
			}

			if (file.size > MAX_IMAGE_SIZE) {
				return c.json({ error: `File ${file.name} exceeds the 3MB limit` }, 400);
			}
			totalImageSize += file.size;
			refinedImages.push(file);
		}

		if (totalImageSize > MAX_TOTAL_IMAGE_SIZE) {
			return c.json({ error: 'Total image size exceeds the 15MB limit' }, 400);
		}

		const { db } = createClient();
		const itemPredicate = and(
			eq(items.id, itemId),
			eq(items.profile_id, c.var.user.profile_id),
			isNull(items.deleted_at),
		);
		const [ownedItem] = await db.select({ id: items.id }).from(items).where(itemPredicate).limit(1);
		if (!ownedItem) {
			return c.json({ message: 'Item not found' }, 404);
		}

		const s3BasePath = `images/items/${itemId}`;
		const s3BucketName = environment.AWS_BUCKET_NAME;
		const batchId = randomUUID();
		let processedImages: ProcessedImage[];
		try {
			processedImages = await Promise.all(
				refinedImages.map(async (file, index) => {
					const originalBuffer = Buffer.from(await file.arrayBuffer());
					const metadata = await sharp(originalBuffer).metadata();
					const attributes = rasterAttributes(metadata.format);

					if (!metadata.width || !metadata.height || !attributes || file.type !== attributes.contentType) {
						throw new Error('Invalid image content');
					}

					const mediumBuffer = await sharp(originalBuffer)
						.resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
						.toFormat(attributes.format)
						.toBuffer();
					const smallBuffer = await sharp(originalBuffer)
						.resize({ width: 500, height: 500, fit: 'inside', withoutEnlargement: true })
						.toFormat(attributes.format)
						.toBuffer();
					const thumbnailBuffer = await sharp(originalBuffer)
						.resize(200, 200, { fit: 'cover' })
						.toFormat(attributes.format)
						.toBuffer();
					const sourceId = `${batchId}-${index}`;

					return {
						originalBuffer,
						mediumBuffer,
						smallBuffer,
						thumbnailBuffer,
						originalKey: `${s3BasePath}/full/${sourceId}_original.${attributes.extension}`,
						mediumKey: `${s3BasePath}/full/${sourceId}_medium.${attributes.extension}`,
						smallKey: `${s3BasePath}/full/${sourceId}_small.${attributes.extension}`,
						thumbKey: `${s3BasePath}/thumbs/${sourceId}_thumbnail.${attributes.extension}`,
						contentType: attributes.contentType,
						orderPosition: index,
					};
				}),
			);
		} catch {
			return c.json({ error: 'Invalid image file' }, 400);
		}

		const uploadedKeys: string[] = [];
		const uploadedFiles = processedImages.map(({ originalKey, smallKey, mediumKey, thumbKey, orderPosition }) => ({
			originalKey,
			smallKey,
			mediumKey,
			thumbKey,
			orderPosition,
		}));

		try {
			for (const file of processedImages) {
				const variants = [
					[file.originalKey, file.originalBuffer],
					[file.mediumKey, file.mediumBuffer],
					[file.smallKey, file.smallBuffer],
					[file.thumbKey, file.thumbnailBuffer],
				] as const;

				for (const [key, body] of variants) {
					uploadedKeys.push(key);
					await s3Client.send(
						new PutObjectCommand({
							Bucket: s3BucketName,
							Key: key,
							Body: body,
							ContentType: file.contentType,
						}),
					);
				}
			}

			const imageRecords: InsertItemImage[] = uploadedFiles.flatMap((file) => [
				{
					item_id: itemId,
					url: `https://${s3BucketName}.s3.amazonaws.com/${file.originalKey}`,
					order_position: file.orderPosition,
					size: 'original',
				},
				{
					item_id: itemId,
					url: `https://${s3BucketName}.s3.amazonaws.com/${file.mediumKey}`,
					order_position: file.orderPosition,
					size: 'medium',
				},
				{
					item_id: itemId,
					url: `https://${s3BucketName}.s3.amazonaws.com/${file.smallKey}`,
					order_position: file.orderPosition,
					size: 'small',
				},
				{
					item_id: itemId,
					url: `https://${s3BucketName}.s3.amazonaws.com/${file.thumbKey}`,
					order_position: file.orderPosition,
					size: 'thumbnail',
				},
			]);

			const persisted = await db.transaction(async (tx) => {
				const [stillOwnedItem] = await tx
					.select({ id: items.id })
					.from(items)
					.where(itemPredicate)
					.for('update')
					.limit(1);
				if (!stillOwnedItem) return false;

				await tx.insert(items_images).values(imageRecords);
				return true;
			});

			if (!persisted) throw new UploadItemUnavailableError();

			return c.json(
				{
					message: `Images for item ${itemIdField} uploaded successfully!`,
					item_id: itemIdField,
					files: uploadedFiles,
				},
				201,
			);
		} catch (error) {
			try {
				await cleanUpUploadedObjects(s3BucketName, uploadedKeys);
			} catch (cleanupError) {
				console.error(`Image upload cleanup failed (${errorName(cleanupError)})`);
			}

			if (error instanceof UploadItemUnavailableError) {
				return c.json({ message: 'Item not found' }, 404);
			}

			console.error(`Image upload failed (${errorName(error)})`);
			return c.json({ error: 'Failed to upload images' }, 500);
		}
	},
);
