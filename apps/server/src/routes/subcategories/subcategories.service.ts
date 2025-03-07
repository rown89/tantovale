import { and, eq, isNull } from "drizzle-orm";
import { createClient } from "#database/index";
import { subcategories } from "#database/schema/subcategories";
import type { AppBindings } from "#lib/types";
import type { Context } from "hono";

export const getSubcategories = async (c: Context<AppBindings>) => {
  const { db } = createClient(c.env);

  return await db
    .select({
      id: subcategories.id,
      name: subcategories.name,
      category_id: subcategories.category_id,
      parent_id: subcategories.parent_id,
    })
    .from(subcategories);
};

export const getSubcategoriesById = async (
  c: Context<AppBindings>,
  id: number,
) => {
  const { db } = createClient(c.env);

  return await db
    .select({
      id: subcategories.id,
      name: subcategories.name,
    })
    .from(subcategories)
    .where(eq(subcategories.id, Number(id)));
};

export const getSubcategoriesWithoutParentById = async (
  c: Context<AppBindings>,
  id: number,
) => {
  const { db } = createClient(c.env);

  return await db
    .select({
      id: subcategories.id,
      name: subcategories.name,
    })
    .from(subcategories)
    .where(
      and(isNull(subcategories.parent_id), eq(subcategories.id, Number(id))),
    );
};
