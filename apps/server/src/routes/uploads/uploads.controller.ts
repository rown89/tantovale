import type { Context } from "hono";
import { uploadItemImages } from "./uploads.service";

import type { AppBindings } from "#lib/types";

export const uploadItemImagesController = async (c: Context<AppBindings>) => {
  try {
    const images = await uploadItemImages(c);

    if (!images.length) {
      return c.json({ message: "Missing images" }, 500);
    }

    return c.json(images, 200);
  } catch (error) {
    return c.json({ message: "uploadItemImagesController error" }, 500);
  }
};
