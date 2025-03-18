import { createClient } from "@workspace/database/db";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import {
  filters,
  subCategoryFilters,
} from "@workspace/database/schemas/schema";

import type { AppBindings } from "#lib/types";

export const getSubcategoryFiltersById = async (
  c: Context<AppBindings>,
  id: number,
) => {
  const { db } = createClient();

  return await db
    .select({
      filter_id: subCategoryFilters.filter_id,
      subcategory_id: subCategoryFilters.subcategory_id,
    })
    .from(subCategoryFilters)
    .where(eq(subCategoryFilters.id, id));
};

export const getFiltersForSubcategory = async (
  c: Context<AppBindings>,
  id: number,
) => {
  const { db } = createClient();

  return await db
    .select({
      id: filters.id,
      name: filters.name,
    })
    .from(subCategoryFilters)
    .innerJoin(filters, eq(subCategoryFilters.filter_id, filters.id))
    .where(eq(subCategoryFilters.subcategory_id, id));
};
