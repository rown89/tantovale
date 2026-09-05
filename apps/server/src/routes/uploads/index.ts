import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { and, count, eq, isNull, max } from 'drizzle-orm';
import { bodyLimit } from 'hono/body-limit';
import sharp from 'sharp';
import { describeRoute } from 'hono-openapi';

import { createClient } from '../../database';
import { items, items_images, type InsertItemImage } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { s3Client } from '../../lib/s3client';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { authPath, environment } from '../../utils/constants';
import { uploadsOpenApi } from '../../openapi/routes';

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const MAX_IMAGE_COUNT = 5;
const MAX_TOTAL_IMAGE_SIZE = MAX_IMAGE_SIZE * MAX_IMAGE_COUNT;
const MAX_MULTIPART_OVERHEAD = 64 * 1024;
const MAX_UPLOAD_BODY_SIZE = MAX_TOTAL_IMAGE_SIZE + MAX_MULTIPART_OVERHEAD;
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const CLEANUP_ATTEMPTS = 2;
const MAX_INPUT_DIMENSION = 2_000;
const MAX_INPUT_PIXELS = MAX_INPUT_DIMENSION * MAX_INPUT_DIMENSION;

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
};

type RasterAttributes = {
	format: RasterFormat;
	contentType: 'image/jpeg' | 'image/png';
	extension: 'jpg' | 'png';
};

type ValidatedImage = {
	originalBuffer: Buffer;
	attributes: RasterAttributes;
	index: number;
};

class UploadItemUnavailableError extends Error {
	constructor() {
		super('Upload item is no longer available');
		this.name = 'UploadItemUnavailableError';
	}
}

class UploadCapacityExceededError extends Error {
	constructor() {
		super('Item image capacity exceeded');
		this.name = 'UploadCapacityExceededError';
	}
}

function rasterAttributes(format: string | undefined): RasterAttributes | undefined {
	if (format === 'jpeg') return { format, contentType: 'image/jpeg', extension: 'jpg' };
	if (format === 'png') return { format, contentType: 'image/png', extension: 'png' };
	return undefined;
}

function decodeImage(buffer: Buffer) {
	return sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS });
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
	describeRoute(uploadsOpenApi.itemImages),
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
			const validatedImages: ValidatedImage[] = [];
			for (const [index, file] of refinedImages.entries()) {
				const originalBuffer = Buffer.from(await file.arrayBuffer());
				const metadata = await decodeImage(originalBuffer).metadata();
				const attributes = rasterAttributes(metadata.format);

				if (
					!metadata.width ||
					!metadata.height ||
					metadata.width > MAX_INPUT_DIMENSION ||
					metadata.height > MAX_INPUT_DIMENSION ||
					metadata.width * metadata.height > MAX_INPUT_PIXELS ||
					!attributes ||
					file.type !== attributes.contentType
				) {
					throw new Error('Invalid image content');
				}

				validatedImages.push({ originalBuffer, attributes, index });
			}

			processedImages = [];
			for (const { originalBuffer, attributes, index } of validatedImages) {
				const mediumBuffer = await decodeImage(originalBuffer)
					.resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
					.toFormat(attributes.format)
					.toBuffer();
				const smallBuffer = await decodeImage(originalBuffer)
					.resize({ width: 500, height: 500, fit: 'inside', withoutEnlargement: true })
					.toFormat(attributes.format)
					.toBuffer();
				const thumbnailBuffer = await decodeImage(originalBuffer)
					.resize(200, 200, { fit: 'cover' })
					.toFormat(attributes.format)
					.toBuffer();
				const sourceId = `${batchId}-${index}`;

				processedImages.push({
					originalBuffer,
					mediumBuffer,
					smallBuffer,
					thumbnailBuffer,
					originalKey: `${s3BasePath}/full/${sourceId}_original.${attributes.extension}`,
					mediumKey: `${s3BasePath}/full/${sourceId}_medium.${attributes.extension}`,
					smallKey: `${s3BasePath}/full/${sourceId}_small.${attributes.extension}`,
					thumbKey: `${s3BasePath}/thumbs/${sourceId}_thumbnail.${attributes.extension}`,
					contentType: attributes.contentType,
				});
			}
		} catch {
			return c.json({ error: 'Invalid image file' }, 400);
		}

		const uploadedKeys: string[] = [];
		const uploadedFileKeys = processedImages.map(({ originalKey, smallKey, mediumKey, thumbKey }) => ({
			originalKey,
			smallKey,
			mediumKey,
			thumbKey,
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

			const uploadedFiles = await db.transaction(async (tx) => {
				const [stillOwnedItem] = await tx
					.select({ id: items.id })
					.from(items)
					.where(itemPredicate)
					.for('update')
					.limit(1);
				if (!stillOwnedItem) throw new UploadItemUnavailableError();

				const [imageState] = await tx
					.select({
						sourceCount: count(items_images.id),
						maxPosition: max(items_images.order_position),
					})
					.from(items_images)
					.where(and(eq(items_images.item_id, itemId), eq(items_images.size, 'original')));
				const sourceCount = Number(imageState?.sourceCount ?? 0);
				if (sourceCount + uploadedFileKeys.length > MAX_IMAGE_COUNT) {
					throw new UploadCapacityExceededError();
				}

				const firstOrderPosition = (imageState?.maxPosition ?? -1) + 1;
				const positionedFiles = uploadedFileKeys.map((file, index) => ({
					...file,
					orderPosition: firstOrderPosition + index,
				}));
				const imageRecords: InsertItemImage[] = positionedFiles.flatMap((file) => [
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

				await tx.insert(items_images).values(imageRecords);
				return positionedFiles;
			});

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
			if (error instanceof UploadCapacityExceededError) {
				return c.json({ error: 'Item image limit exceeded' }, 400);
			}

			console.error(`Image upload failed (${errorName(error)})`);
			return c.json({ error: 'Failed to upload images' }, 500);
		}
	},
);
