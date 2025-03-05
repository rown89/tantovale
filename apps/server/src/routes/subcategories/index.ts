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
  .get("/:id", async (c) => {
    try {
      const { db } = createClient(c.env);
      const id = Number(c.req.param("id"));

      if (isNaN(id)) {
        return c.json({ message: "Invalid subcategory ID" }, 400);
      }

      const subcategoryList = await db
        .select({
          id: subcategories.id,
          name: subcategories.name,
        })
        .from(subcategories)
        .where(eq(subcategories.category_id, Number(id)));

      if (!subcategoryList.length) {
        return c.json({ message: "Missing subcategories" }, 404);
      }

      return c.json(subcategoryList, 200);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        { message: "subcategoriesRoute :id error", error: errorMessage },
        500,
      );
    }
  });
