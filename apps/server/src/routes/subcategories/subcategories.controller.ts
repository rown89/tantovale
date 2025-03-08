import type { Context } from "hono";
import {
  getSubcategories,
  getSubcategoriesById,
  getSubcategoriesWithoutParentById,
} from "./subcategories.service";

import type { AppBindings } from "#lib/types";

export const getSubcategoriesController = async (c: Context<AppBindings>) => {
  try {
    const subcategories = await getSubcategories(c);

    if (!subcategories.length) {
      return c.json({ message: "Missing subcategories" }, 500);
    }

    return c.json(subcategories, 200);
  } catch (error) {
    return c.json({ message: "subcategoriesRoute error" }, 500);
  }
};

export const getSubcategoriesByIdController = async (
  c: Context<AppBindings>,
) => {
  const id = Number(c.req.param("id"));

  if (!id) return c.json({ error: "subcategory id is required" }, 400);
  if (isNaN(id)) return c.json({ message: "Invalid ID" }, 400);

  const subcategory = await getSubcategoriesById(c, id);

  if (!subcategory.length) {
    return c.json({ message: "Invalid subcategory ID" }, 400);
  }

  return c.json(subcategory);
};

export const getSubcategoriesWithoutParentByIdController = async (
  c: Context<AppBindings>,
) => {
  const id = Number(c.req.param("id"));

  if (!id) return c.json({ error: "Invalid id required" }, 400);
  if (isNaN(id)) return c.json({ message: "Invalid subcategory ID" }, 400);

  const subcategoriesWithoutParent = await getSubcategoriesWithoutParentById(
    c,
    id,
  );

  return c.json(subcategoriesWithoutParent);
};
