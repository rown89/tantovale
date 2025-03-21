import { createRouter } from "#lib/create-app";
import fs from "fs";
import { env } from "hono/adapter";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import path from "path";
import sharp from "sharp";

export const uploadsRoute = createRouter().post("/images-item", async (c) => {
  const { ACCESS_TOKEN_SECRET } = env<{
    ACCESS_TOKEN_SECRET: string;
  }>(c);

  const accessToken = getCookie(c, "access_token");
  let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
  const user_id = Number(payload.id);

  const formData = await c.req.parseBody({ all: true, dot: true });
  const { images, item_id } = formData;

  const receivedImages = Array.isArray(images) ? images : [images];

  if (
    !accessToken ||
    !images ||
    !item_id ||
    !user_id ||
    !receivedImages.length
  ) {
    return c.json({ message: "Upload images-item error" }, 400);
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

  try {
    // Create base directories for the item
    const baseDir = path.join(process.cwd(), "uploads");
    const imagesDir = "images";
    const itemsDir = "items";

    const uploadPath = path.join(
      baseDir,
      imagesDir,
      itemsDir,
      item_id.toString(),
    );

    const fullFolderPath = path.join(uploadPath, "full");
    const thumbFolderPath = path.join(uploadPath, "thumbs");

    // Ensure directories exist
    fs.mkdirSync(fullFolderPath, { recursive: true });
    fs.mkdirSync(thumbFolderPath, { recursive: true });

    // Upload images in parallel
    const uploadPromises = refinedImages
      ?.filter((file): file is File => file instanceof File)
      .map(async (file: File) => {
        const timestamp = Date.now();
        const fileName = file.name.split(".")?.[0];
        const extension = file.name.split(".").pop();

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

        // Save full images & their variants to `full/`
        const originalPath = path.join(
          fullFolderPath,
          `${fileName}_original_${timestamp}.${extension}`,
        );
        const mediumPath = path.join(
          fullFolderPath,
          `${fileName}_medium_${timestamp}.${extension}`,
        );
        const thumbPath = path.join(
          thumbFolderPath,
          `${fileName}_${timestamp}_thumb.${extension}`,
        );

        // Write files to disk
        await fs.promises.writeFile(originalPath, originalBuffer);
        await fs.promises.writeFile(mediumPath, mediumBuffer);
        await fs.promises.writeFile(thumbPath, thumbnailBuffer);
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
