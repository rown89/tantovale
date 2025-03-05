import { Hono } from "hono";
import { createClient } from "#database/index";
import { categories } from "#database/schema/categories";
import type { AppBindings } from "#lib/types";

export const categoriesRoute = new Hono<AppBindings>().get("/", async (c) => {
  try {
    const { db } = createClient(c.env);

    const categoryList = await db
      .select({
        id: categories.id,
        name: categories.name,
      })
      .from(categories);

    if (!categoryList.length) {
      return c.json({ message: "Missing categoryList" }, 404);
    }

    return c.json(categoryList, 200);
  } catch (error) {
    return c.json({ message: "categoriesRoute error" }, 500);
  }
});
