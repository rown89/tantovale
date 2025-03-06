import type { Context } from "hono";
import {
  getFiltersForSubcategory,
  getSubcategoryFiltersById,
} from "./subcategory-filters.service";

import type { AppBindings } from "#lib/types";

export const getFiterSubcategoryByIdController = async (
  c: Context<AppBindings>,
) => {
  const id = Number(c.req.param("id"));

  if (!id) return c.json({ error: "subcategory id is required" }, 400);
  if (isNaN(id)) return c.json({ message: "Invalid subcategory ID" }, 400);

  try {
    const filters = await getSubcategoryFiltersById(c, id);

    if (!filters.length)
      return c.json({ message: "Missing subcategoryFilters" }, 500);

    return c.json(filters, 200);
  } catch (error) {
    return c.json({ message: "subcategoriesRoute error" }, 500);
  }
};

export const getFiltersForSubcategoryController = async (
  c: Context<AppBindings>,
) => {
  const id = Number(c.req.param("id"));

  if (!id) return c.json({ error: "filter id is required" }, 400);
  if (isNaN(id)) return c.json({ message: "Invalid filter ID" }, 400);

  const filters = await getFiltersForSubcategory(c, id);
  return c.json(filters);
};
