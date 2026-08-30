import { DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';

import { createClient } from '../../database';
import { items, items_images, type InsertItemImage } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';
import { s3Client } from '../../lib/s3client';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { authPath, environment } from '../../utils/constants';

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

type ProcessedImage = {
	originalBuffer: Buffer;
	mediumBuffer: Buffer;
	smallBuffer: Buffer;
	thumbnailBuffer: Buffer;
	originalKey: string;
	mediumKey: string;
	smallKey: string;
	thumbKey: string;
	contentType: string;
	orderPosition: number;
};

export const uploadsRoute = createRouter().post(`/${authPath}/images-item`, authMiddleware, async (c) => {
	let formData: Awaited<ReturnType<typeof c.req.parseBody>>;
	try {
		formData = await c.req.parseBody({ all: true, dot: true });
	} catch {
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
		receivedImages.length === 0
	) {
		return c.json({ message: 'Upload images-item error' }, 400);
	}

	const refinedImages: File[] = [];
	for (const file of receivedImages) {
		if (!(file instanceof File) || !file.type.startsWith('image/')) {
			return c.json({ error: 'Invalid file type' }, 400);
		}

		if (file.size > MAX_IMAGE_SIZE) {
			return c.json({ error: `File ${file.name} exceeds the 3MB limit` }, 400);
		}
		refinedImages.push(file);
	}

	const { db } = createClient();
	const [ownedItem] = await db
		.select({ id: items.id })
		.from(items)
		.where(and(eq(items.id, itemId), eq(items.profile_id, c.var.user.profile_id)))
		.limit(1);
	if (!ownedItem) {
		return c.json({ message: 'Item not found' }, 404);
	}

	const s3BasePath = `images/items/${itemId}`;
	const s3BucketName = environment.AWS_BUCKET_NAME;
	let processedImages: ProcessedImage[];
	try {
		processedImages = await Promise.all(
			refinedImages.map(async (file, index) => {
				const timestamp = Date.now();
				const fileName = file.name.split('.')?.[0];
				const extension = file.name.split('.').pop();
				const originalBuffer = Buffer.from(await file.arrayBuffer());
				const metadata = await sharp(originalBuffer).metadata();
				const { width, height } = metadata;

				if (!width || !height || !metadata.format) {
					throw new Error('Invalid image metadata');
				}

				const mediumBuffer = await sharp(originalBuffer)
					.resize({
						width: width > 800 ? undefined : width,
						height: height > 800 ? 800 : height,
						fit: 'inside',
					})
					.toBuffer();
				const smallBuffer = await sharp(originalBuffer)
					.resize({
						width: width > 500 ? undefined : width,
						height: height > 500 ? 500 : height,
						fit: 'inside',
					})
					.toBuffer();
				const thumbnailBuffer = await sharp(originalBuffer).resize(200, 200, { fit: 'cover' }).toBuffer();

				return {
					originalBuffer,
					mediumBuffer,
					smallBuffer,
					thumbnailBuffer,
					originalKey: `${s3BasePath}/full/${fileName}_original_${timestamp}.${extension}`,
					mediumKey: `${s3BasePath}/full/${fileName}_medium_${timestamp}.${extension}`,
					smallKey: `${s3BasePath}/full/${fileName}_small_${timestamp}.${extension}`,
					thumbKey: `${s3BasePath}/thumbs/${fileName}_${timestamp}_thumb.${extension}`,
					contentType: file.type,
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
				await s3Client.send(
					new PutObjectCommand({
						Bucket: s3BucketName,
						Key: key,
						Body: body,
						ContentType: file.contentType,
					}),
				);
				uploadedKeys.push(key);
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

		await db.insert(items_images).values(imageRecords);

		return c.json(
			{
				message: `Images for item ${itemIdField} uploaded successfully!`,
				item_id: itemIdField,
				files: uploadedFiles,
			},
			201,
		);
	} catch (error) {
		if (uploadedKeys.length > 0) {
			try {
				const deleted = await s3Client.send(
					new DeleteObjectsCommand({
						Bucket: s3BucketName,
						Delete: { Objects: uploadedKeys.map((Key) => ({ Key })) },
					}),
				);

				if (deleted.Errors?.length) {
					throw new Error(`Failed to delete ${deleted.Errors.length} uploaded object(s)`);
				}
			} catch (cleanupError) {
				console.error('Error cleaning up uploaded images:', cleanupError);
			}
		}

		console.error('Error uploading images to S3:', error);
		return c.json({ error: 'Failed to upload images' }, 500);
	}
});
