import { Hono } from "hono";
import {
  getFiltersForSubcategoryController,
  getFiterSubcategoryByIdController,
} from "./subcategory-filters.controller";

import type { AppBindings } from "#lib/types";

export const subcategoryFiltersRoute = new Hono<AppBindings>()
  .get("/:id", async (c) => getFiterSubcategoryByIdController(c))
  .get("/filter/:id", async (c) => getFiltersForSubcategoryController(c));
