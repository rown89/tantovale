import {
  getFiltersForSubcategoryController,
  getFiterSubcategoryByIdController,
} from "./subcategory-filters.controller";

import { createRouter } from "#lib/create-app";

export const subcategoryFiltersRoute = createRouter()
  .get("/:id", async (c) => getFiterSubcategoryByIdController(c))
  .get("/filter/:id", async (c) => getFiltersForSubcategoryController(c));
