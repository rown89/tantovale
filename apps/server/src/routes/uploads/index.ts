import { env } from 'hono/adapter';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { createRouter } from '../../lib/create-app';
import { s3Client } from '../../lib/s3client';
import { createClient } from '../../database';
import { items_images, type InsertItemImage } from '../../database/schemas/schema';
import { authPath, environment } from '../../utils/constants';
import { authMiddleware } from '../../middlewares/authMiddleware';

export const uploadsRoute = createRouter().post(`/${authPath}/images-item`, authMiddleware, async (c) => {
	const { ACCESS_TOKEN_SECRET } = env<{
		ACCESS_TOKEN_SECRET: string;
	}>(c);

	const accessToken = getCookie(c, 'access_token');
	let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
	const user_id = Number(payload.id);

	const formData = await c.req.parseBody({ all: true, dot: true });
	const { images, item_id } = formData;

	const receivedImages = Array.isArray(images) ? images : [images];

	if (!accessToken || !images || !item_id || !user_id || !receivedImages.length) {
		return c.json({ message: 'Upload images-item error' }, 400);
	}

	// Validate files are images and do not exceed 5MB
	for (const file of receivedImages) {
		if (!(file instanceof File) || !file.type.startsWith('image/')) {
			return c.json({ error: 'Invalid file type' }, 400);
		}

		if (file.size > 3 * 1024 * 1024) {
			return c.json({ error: `File ${file.name} exceeds the 3MB limit` }, 400);
		}
	}

	let refinedImages = [];

	Array.isArray(images) ? (refinedImages = images) : (refinedImages = [images]);

	try {
		// Define S3 paths
		const s3BasePath = `images/items/${item_id}`;
		const s3BucketName = environment.AWS_BUCKET_NAME;

		// Upload images in parallel
		const uploadPromises = refinedImages
			?.filter((file): file is File => file instanceof File)
			.map(async (file: File, index: number) => {
				const timestamp = Date.now();
				const fileName = file.name.split('.')?.[0];
				const extension = file.name.split('.').pop();

				// Read file buffer
				const buffer = await file.arrayBuffer();
				const originalBuffer = Buffer.from(buffer);

				let metadata;
				try {
					metadata = await sharp(originalBuffer).metadata();
				} catch (error) {
					throw new Error(`Error processing file: ${file.name}`);
				}

				const { width, height } = metadata;
				const mediumMaxSize = 800;
				const smallMaxSize = 500;

				// Resize logic medium
				const mediumBuffer = await sharp(originalBuffer)
					.resize({
						width: width && width > mediumMaxSize ? undefined : width, // Keep original width if <= mediumMaxSize
						height: height && height > mediumMaxSize ? mediumMaxSize : height, // Max height mediumMaxSize
						fit: 'inside', // Maintain aspect ratio
					})
					.toBuffer();

				// Resize logic small
				const smallBuffer = await sharp(originalBuffer)
					.resize({
						width: width && width > smallMaxSize ? undefined : width, // Keep original width if <= mediumMaxSize
						height: height && height > smallMaxSize ? smallMaxSize : height, // Max height mediumMaxSize
						fit: 'inside', // Maintain aspect ratio
					})
					.toBuffer();

				const thumbnailBuffer = await sharp(originalBuffer)
					.resize(200, 200, { fit: 'cover' }) // Force 200x200 crop
					.toBuffer();

				// Define S3 keys for each image variant
				const originalKey = `${s3BasePath}/full/${fileName}_original_${timestamp}.${extension}`;
				const mediumKey = `${s3BasePath}/full/${fileName}_medium_${timestamp}.${extension}`;
				const smallKey = `${s3BasePath}/full/${fileName}_small_${timestamp}.${extension}`;
				const thumbKey = `${s3BasePath}/thumbs/${fileName}_${timestamp}_thumb.${extension}`;

				// Upload original image to S3
				await s3Client.send(
					new PutObjectCommand({
						Bucket: s3BucketName,
						Key: originalKey,
						Body: originalBuffer,
						ContentType: file.type,
					}),
				);

				// Upload medium image to S3
				await s3Client.send(
					new PutObjectCommand({
						Bucket: s3BucketName,
						Key: mediumKey,
						Body: mediumBuffer,
						ContentType: file.type,
					}),
				);

				// Upload small image to S3
				await s3Client.send(
					new PutObjectCommand({
						Bucket: s3BucketName,
						Key: smallKey,
						Body: smallBuffer,
						ContentType: file.type,
					}),
				);

				// Upload thumbnail to S3
				await s3Client.send(
					new PutObjectCommand({
						Bucket: s3BucketName,
						Key: thumbKey,
						Body: thumbnailBuffer,
						ContentType: file.type,
					}),
				);

				return {
					originalKey,
					smallKey,
					mediumKey,
					thumbKey,
					orderPosition: index, // Store the original array position
				};
			});

		const uploadedFiles = await Promise.all(uploadPromises);

		// Save image URLs to database
		const { db } = createClient();

		// Prepare data for database insertion - one row for each size
		const imageRecords: InsertItemImage[] = uploadedFiles.flatMap((file) => [
			// Original image
			{
				item_id: Number(item_id),
				url: `https://${s3BucketName}.s3.amazonaws.com/${file.originalKey}`,
				order_position: file.orderPosition,
				created_by: user_id,
				size: 'original',
			},
			// Medium image
			{
				item_id: Number(item_id),
				url: `https://${s3BucketName}.s3.amazonaws.com/${file.mediumKey}`,
				order_position: file.orderPosition,
				created_by: user_id,
				size: 'medium',
			},
			// Small image
			{
				item_id: Number(item_id),
				url: `https://${s3BucketName}.s3.amazonaws.com/${file.smallKey}`,
				order_position: file.orderPosition,
				created_by: user_id,
				size: 'small',
			},
			// Thumbnail image
			{
				item_id: Number(item_id),
				url: `https://${s3BucketName}.s3.amazonaws.com/${file.thumbKey}`,
				order_position: file.orderPosition,
				created_by: user_id,
				size: 'thumbnail',
			},
		]);

		// Insert records into the database
		await db.insert(items_images).values(imageRecords);

		return c.json(
			{
				message: `Images for item ${item_id} uploaded successfully!`,
				item_id,
				files: uploadedFiles,
			},
			201,
		);
	} catch (error) {
		console.error('Error uploading images to S3:', error);
		return c.json({ error: 'Failed to upload images' }, 500);
	}
});
