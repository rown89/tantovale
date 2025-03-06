import { Hono } from "hono";
import type { AppBindings } from "#lib/types";
import {
  getFiltersForSubcategoryController,
  getFiterSubcategoryByIdController,
} from "./subcategory-filters.controller";

export const subcategoryFiltersRoute = new Hono<AppBindings>()
  .get("/:id", async (c) => getFiterSubcategoryByIdController(c))
  .get("/filter/:id", async (c) => getFiltersForSubcategoryController(c));
