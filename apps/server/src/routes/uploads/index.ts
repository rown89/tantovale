import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { s3Client } from "#lib/s3Client";
import { Upload } from "@aws-sdk/lib-storage";
import sharp from "sharp";

import type { AppBindings } from "#lib/types";

export const uploadsRoute = new Hono<AppBindings>().post(
  "/item-images",
  async (c) => {
    const formData = await c.req.parseBody({ all: true, dot: true });
    const { images, item_id } = formData;

    const receivedImages = Array.isArray(images) ? images : [images];

    if (!receivedImages.length) {
      return c.json({ error: "No images uploaded" }, 400);
    }
    // Validate files are images and do not exceed 5MB
    for (const file of receivedImages) {
      if (!(file instanceof File) || !file.type.startsWith("image/")) {
        return c.json({ error: "Invalid file type" }, 400);
      }
      if (file.size > 5 * 1024 * 1024) {
        return c.json(
          { error: `File ${file.name} exceeds the 5MB limit` },
          400,
        );
      }
    }

    // Initialize S3 client
    const client = s3Client(
      c.env.AWS_REGION,
      c.env.AWS_ACCESS_KEY_ID,
      c.env.AWS_SECRET_ACCESS_KEY,
    );

    let refinedImages = [];

    Array.isArray(images)
      ? (refinedImages = images)
      : (refinedImages = [images]);

    // Upload images to S3 in parallel
    const uploadPromises = refinedImages
      ?.filter((file): file is File => file instanceof File)
      .map(async (file: File) => {
        const timestamp = Date.now();
        const fileName = file.name.split(".")?.[0];
        const extension = file.name.split(".").pop();

        const itemImagesRoot = `items/${item_id}`;
        const fullFolderPath = `${itemImagesRoot}/full`;
        const thumbFolderPath = `${itemImagesRoot}/thumbs`;

        // Read file buffer
        const buffer = await file.arrayBuffer();
        console.log("ArrayBuffer Length:", buffer?.byteLength);
        const originalBuffer = Buffer.from(buffer);
        console.log("Original Buffer Length:", originalBuffer?.byteLength);

        let metadata;
        try {
          metadata = await sharp(originalBuffer).metadata();
          console.log("Metadata:", metadata); // Log metadata for debugging
        } catch (error) {
          console.error("Error reading metadata for file:", file.name, error);
          return c.json({ error: `Error processing file: ${file.name}` }, 400);
        }

        const { width, height } = metadata;
        const mediumMaxSize = 800;

        // Resize logic
        const mediumBuffer = await sharp(originalBuffer)
          .resize({
            width: width && width > mediumMaxSize ? undefined : width, // Keep original width if <= mediumMaxSize
            height: height && height > mediumMaxSize ? mediumMaxSize : height, // Max height mediumMaxSize
            fit: "inside", // Maintain aspect ratio
          })
          .toBuffer();

        const thumbnailBuffer = await sharp(originalBuffer)
          .resize(200, 200, { fit: "cover" }) // Force 200x200 crop
          .toBuffer();

        // Upload full images & their variants to `full/`
        const fullUploads = [
          { key: "original", buffer: originalBuffer },
          { key: "medium", buffer: mediumBuffer },
        ].map(async ({ key, buffer }) => {
          const upload = new Upload({
            client,
            params: {
              Bucket: c.env.AWS_BUCKET_NAME,
              Key: `${fullFolderPath}/${fileName}_${timestamp}.${extension}`,
              Body: buffer,
              ContentType: file.type,
            },
          });

          return upload.done();
        });

        // Upload thumbnails to `thumbs/`
        const thumbUpload = new Upload({
          client,
          params: {
            Bucket: c.env.AWS_BUCKET_NAME,
            Key: `${thumbFolderPath}/${fileName}_${timestamp}_thumb.${extension}`,
            Body: thumbnailBuffer,
            ContentType: file.type,
          },
        });

        await Promise.all([...fullUploads, thumbUpload.done()]);
      });

    await Promise.all(uploadPromises);

    return c.json(
      {
        message: `Images for item ${item_id} uploaded successfully!`,
        item_id,
      },
      201,
    );
  },
);
