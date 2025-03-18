import { Hono } from "hono";
import {
  getFilterByIdController,
  getFiltersBySubcategoryFiltersId,
} from "./filters.controller";

import type { AppBindings } from "#lib/types";

export const filtersRoute = new Hono<AppBindings>()
  .get("/:id", getFilterByIdController)
  .get("/subcategory_filters/:id", getFiltersBySubcategoryFiltersId);
