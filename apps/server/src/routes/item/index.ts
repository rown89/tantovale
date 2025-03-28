import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { createClient } from "@workspace/database/db";
import { subcategories } from "@workspace/database/schemas/subcategories";
import { subCategoryFilters } from "@workspace/database/schemas/subcategory_filters";
import { createItemSchema } from "../../schema";
import { items } from "@workspace/database/schemas/items";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { itemsFiltersValues } from "@workspace/database/schemas/items_filter_values";
import { env } from "hono/adapter";
import { createRouter } from "#lib/create-app";
import { z } from "zod";

export const itemRoute = createRouter()
  .post("/new", zValidator("json", createItemSchema), async (c) => {
    try {
      const { ACCESS_TOKEN_SECRET } = env<{
        ACCESS_TOKEN_SECRET: string;
      }>(c);

      const { commons, properties } = c.req.valid("json");

      // Auth TOKEN
      const accessToken = getCookie(c, "access_token");

      let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);

      const user_id = Number(payload.id);

      if (!user_id) return c.json({ message: "Invalid user identifier" }, 400);

      const { db } = createClient();

      // Validate subcategory exists
      const availableSubcategory = await db
        .select()
        .from(subcategories)
        .where(eq(subcategories.id, commons.subcategory_id))
        .limit(1)
        .then((results) => results[0]);

      if (!availableSubcategory) {
        return c.json(
          {
            message: `Subcategory with ID ${commons.subcategory_id} doesn't exist`,
          },
          400,
        );
      }

      // TODO: CHECK WITH AI IF COMMONS VALUES CONTAINS MATURE OR POTENTIAL INVALID CONTENT

      return await db.transaction(async (tx) => {
        // Create the new item
        const [newItem] = await tx
          .insert(items)
          .values({
            ...commons,
            user_id,
            status: "available",
            published: true,
          })
          .returning();

        if (!newItem?.id) {
          throw new Error("Failed to create item");
        }

        // Handle item properties(filters) if provided
        if (properties?.length) {
          // Get valid filters for this subcategory
          const subcategoryFilters = await tx
            .select()
            .from(subCategoryFilters)
            .where(
              eq(subCategoryFilters.subcategory_id, commons.subcategory_id),
            );

          const validFilterIds = new Set(
            subcategoryFilters.map((f) => f.filter_id),
          );

          // Validate all properties exist
          const invalidProperties = properties.filter(
            (p) => !validFilterIds.has(p.id),
          );

          if (invalidProperties.length) {
            throw new Error("Some properties have invalid filter IDs");
          }

          // Insert filter values
          await tx.insert(itemsFiltersValues).values(
            properties.map(({ id: filter_value_id }) => ({
              item_id: newItem.id,
              filter_value_id,
            })),
          );
        }

        // Return the created item
        return c.json(
          {
            message: "Item created successfully",
            item_id: newItem.id,
          },
          201,
        );
      });
    } catch (error) {
      console.error("Error creating item:", error);
      return c.json(
        {
          message:
            error instanceof Error ? error.message : "Failed to create item",
        },
        400,
      );
    }
  })
  .put("/edit/:id", async (c) => {
    return c.json({});
  })
  .post(
    "/user_delete_item",
    zValidator(
      "json",
      z.object({
        id: z.number(),
      }),
    ),
    async (c) => {
      const { ACCESS_TOKEN_SECRET } = env<{
        ACCESS_TOKEN_SECRET: string;
      }>(c);

      const { id } = c.req.valid("json");

      const accessToken = getCookie(c, "access_token");
      let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
      const user_id = Number(payload.id);

      if (!user_id) return c.json({ message: "Invalid user id" }, 401);

      const { db } = createClient();

      try {
        await db.transaction(async (tx) => {
          // First check if the item exists and belongs to the user
          const itemExists = await tx
            .select({ id: items.id })
            .from(items)
            .where(and(eq(items.id, id), eq(items.user_id, user_id)))
            .limit(1)
            .then((results) => results[0]);

          if (!itemExists) {
            return c.json(
              {
                message:
                  "Item not found or you don't have permission to delete it",
              },
              404,
            );
          }

          // unpublish and set user_deleted:true item
          const [updatedItem] = await db
            .update(items)
            .set({
              published: false,
              deleted_at: new Date(),
            })
            .where(eq(items.id, id))
            .returning();

          if (!updatedItem?.id) {
            return c.json(
              {
                message: `Item ${id} cant be deleted because doesn't exist.`,
                id,
              },
              401,
            );
          }
        });

        return c.json(
          {
            message: "Item deleted successfully",
            id,
          },
          200,
        );
      } catch (error) {
        return c.json(
          {
            message:
              error instanceof Error
                ? error.message
                : `Failed to delete item ${id}`,
          },
          500,
        );
      }
    },
  )
  .post(
    "/publish_state",
    zValidator(
      "json",
      z.object({
        id: z.number(),
        published: z.boolean(),
      }),
    ),
    async (c) => {
      const { ACCESS_TOKEN_SECRET } = env<{
        ACCESS_TOKEN_SECRET: string;
      }>(c);

      const { id, published } = c.req.valid("json");

      const accessToken = getCookie(c, "access_token");
      let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
      const user_id = Number(payload.id);

      if (!user_id) return c.json({ message: "Invalid user id" }, 401);

      const { db } = createClient();
      try {
        await db.transaction(async (tx) => {
          // First check if the item exists and belongs to the user
          const itemExists = await tx
            .select({ id: items.id })
            .from(items)
            .where(and(eq(items.id, id), eq(items.user_id, user_id)))
            .limit(1)
            .then((results) => results[0]);

          if (!itemExists) {
            return c.json(
              {
                message:
                  "Item not found or you don't have permission to delete it",
              },
              404,
            );
          }

          // unpublish item
          const [updatedItem] = await db
            .update(items)
            .set({
              published,
            })
            .where(eq(items.id, id))
            .returning();

          if (!updatedItem?.id) {
            return c.json(
              {
                message: `Item ${id} cant be deleted because doesn't exist.`,
                id,
              },
              401,
            );
          }
        });

        return c.json(
          {
            message: "Item deleted successfully",
            id,
          },
          200,
        );
      } catch (error) {
        return c.json(
          {
            message:
              error instanceof Error
                ? error.message
                : `Failed to delete item ${id}`,
          },
          500,
        );
      }
    },
  );
/*
  // usefull for future admin panel
  .delete("/delete/:id", async (c) => {
    const { ACCESS_TOKEN_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
    }>(c);

    const id = Number(c.req.param("id"));

    if (!id) return c.json({ error: "item id is required" }, 400);
    if (isNaN(id)) return c.json({ message: "Invalid item ID" }, 400);

    const accessToken = getCookie(c, "access_token");
    let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
    const user_id = Number(payload.id);

    if (!user_id) return c.json({ message: "Invalid user id" }, 401);

    const { db } = createClient();

    try {
      await db.transaction(async (tx) => {
        // First check if the item exists and belongs to the user
        const itemExists = await tx
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.id, id), eq(items.user_id, user_id)))
          .limit(1)
          .then((results) => results[0]);

        if (!itemExists) {
          return c.json(
            {
              message:
                "Item not found or you don't have permission to delete it",
            },
            404,
          );
        }

        // delete the item
        const [deletedItem] = await db
          .delete(items)
          .where(eq(items.id, id))
          .returning();

        if (!deletedItem?.id) {
          return c.json(
            {
              message: `Item ${id} cant be deleted because doesn't exist.`,
              id,
            },
            401,
          );
        }
      });

      return c.json(
        {
          message: "Item deleted successfully",
          id,
        },
        200,
      );
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof Error
              ? error.message
              : `Failed to delete item ${id}`,
        },
        500,
      );
    }
  }); 
*/
