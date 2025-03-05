import { Hono } from "hono";
import { createClient } from "#database/index";
import type { AppBindings } from "#lib/types";
import { subCategoryFilters } from "#database/schema/subcategory_filters";
import { eq } from "drizzle-orm";

export const subcategoryFiltersRoute = new Hono<AppBindings>().get(
  "/:id{[0-9]+}",
  async (c) => {
    const id = c.req.param("id");

    try {
      const { db } = createClient(c.env);

      const subcategoryFiltersList = await db
        .select({
          filter_id: subCategoryFilters.filter_id,
          subcategory_id: subCategoryFilters.subcategory_id,
        })
        .from(subCategoryFilters)
        .where(eq(subCategoryFilters.id, Number(id)));

      if (!subcategoryFiltersList.length)
        return c.json({ message: "Missing subcategoryFilters" }, 500);

      return c.json(subcategoryFiltersList, 200);
    } catch (error) {
      return c.json({ message: "subcategoriesRoute error" }, 500);
    }
  },
);
