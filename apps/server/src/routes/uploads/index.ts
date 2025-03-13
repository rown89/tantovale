import { Hono } from "hono";
import { uploadItemImagesController } from "./uploads.controller";

import type { AppBindings } from "#lib/types";

export const uploadsRoute = new Hono<AppBindings>().get(
  "/:id",
  uploadItemImagesController,
);
