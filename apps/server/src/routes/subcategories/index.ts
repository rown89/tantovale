import { Hono } from "hono";
import {
  getSubcategoriesByIdController,
  getSubcategoriesController,
  getSubcategoriesWithoutParentByIdController,
} from "./subcategories.controller";

import type { AppBindings } from "#lib/types";

export const subcategoriesRoute = new Hono<AppBindings>()
  .get("/", getSubcategoriesController)
  .get("/:id", getSubcategoriesByIdController)
  .get("/no_parent/:id", getSubcategoriesWithoutParentByIdController);
