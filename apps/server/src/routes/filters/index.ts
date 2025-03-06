import { Hono } from "hono";
import type { AppBindings } from "#lib/types";
import {
  getFilterByIdController,
  getFiltersBySubcategoryFiltersId,
} from "./filters.controller";

export const filtersRoute = new Hono<AppBindings>()
  .get("/:id", getFilterByIdController)
  .get("/subcategory_filters/:id", getFiltersBySubcategoryFiltersId);
