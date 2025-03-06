import { eq } from "drizzle-orm";
import { createClient } from "#database/index";
import { filters } from "#database/schema/filters";

import type { Context } from "hono";
import type { AppBindings } from "#lib/types";
import { subCategoryFilters } from "#database/schema/subcategory_filters";

export const getFilterByIdService = async (
  c: Context<AppBindings>,
  id: number,
) => {
  try {
    const { db } = createClient(c.env);

    const filtersList = await db
      .select()
      .from(filters)
      .where(eq(filters.id, Number(id)));

    if (!filtersList.length) return c.json({ message: "Missing filters" }, 500);

    return c.json(filtersList, 200);
  } catch (error) {
    return c.json({ message: "getFilterByIdService error" }, 500);
  }
};

export const getFiltersBySubcategoryFiltersIdService = async (
  c: Context<AppBindings>,
  id: number,
) => {
  try {
    const { db } = createClient(c.env);

    const filtersList = await db
      .select({
        id: filters.id,
        name: filters.name,
      })
      .from(subCategoryFilters)
      .innerJoin(filters, eq(subCategoryFilters.filter_id, filters.id))
      .where(eq(subCategoryFilters.subcategory_id, id));

    if (!filtersList.length) return c.json({ message: "Missing filters" }, 500);

    return c.json(filtersList, 200);
  } catch (error) {
    return c.json(
      { message: "getFiltersBySubcategoryFiltersIdService error" },
      500,
    );
  }
};
