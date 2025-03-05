import { Hono } from "hono";
import { createClient } from "#database/index";
import { subcategories } from "#database/schema/subcategories";
import type { AppBindings } from "#lib/types";
import { eq } from "drizzle-orm";

export const subcategoriesRoute = new Hono<AppBindings>()
  .get("/", async (c) => {
    try {
      const { db } = createClient(c.env);

      const subcategoryList = await db
        .select({
          id: subcategories.id,
          name: subcategories.name,
        })
        .from(subcategories);

      if (!subcategoryList.length) {
        return c.json({ message: "Missing subcategories" }, 500);
      }

      return c.json(subcategoryList, 200);
    } catch (error) {
      return c.json({ message: "subcategoriesRoute error" }, 500);
    }
  })
  .get("/:id{[0-9]+}", async (c) => {
    try {
      const id = c.req.param("id");
      const { db } = createClient(c.env);

      const subcategoryList = await db
        .select({
          id: subcategories.id,
          name: subcategories.name,
        })
        .from(subcategories)
        .where(eq(subcategories.id, Number(id)));

      if (!subcategoryList.length) {
        return c.json({ message: "Missing subcategories" }, 500);
      }

      return c.json(subcategoryList, 200);
    } catch (error) {
      return c.json({ message: "subcategoriesRoute :id error" }, 500);
    }
  });
