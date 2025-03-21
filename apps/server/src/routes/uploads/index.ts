import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

import { createRouter } from "#lib/create-app";

export const uploadsRoute = createRouter().post("/item-images", async (c) => {
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
      return c.json({ error: `File ${file.name} exceeds the 5MB limit` }, 400);
    }
  }

  let refinedImages = [];

  Array.isArray(images) ? (refinedImages = images) : (refinedImages = [images]);

  const client = new S3Client({});

  try {
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
        const originalBuffer = Buffer.from(buffer);

        let metadata;
        try {
          metadata = await sharp(originalBuffer).metadata();
          console.log("Metadata:", metadata); // Log metadata for debugging
        } catch (error) {
          console.error("Error reading metadata for file:", file.name, error);
          throw new Error(`Error processing file: ${file.name}`);
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
              Bucket: Resource.Tantovale_Bucket.name,
              Key: `${fullFolderPath}/${fileName}_${key}_${timestamp}.${extension}`,
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
            Bucket: Resource.Tantovale_Bucket.name,
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
  } catch (error) {
    console.error("Error uploading images:", error);
    return c.json({ error: "Failed to upload images" }, 500);
  }
});
