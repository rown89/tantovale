import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { createClient } from "#database/db";
import { subcategories } from "#database/schema/subcategories";
import { subCategoryFilters } from "#database/schema/subcategory_filters";
import { createItemSchema } from "../../schema";
import { items } from "#database/schema/items";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { itemsFiltersValues } from "#database/schema/items_filter_values";
import type { AppBindings } from "#lib/types";

export const itemRoute = new Hono<AppBindings>().post(
  "/new",
  zValidator("json", createItemSchema),
  async (c) => {
    try {
      const { ACCESS_TOKEN_SECRET } = c.env;
      const { commons, properties } = c.req.valid("json");

      // Auth TOKEN
      const accessToken = getCookie(c, "access_token");
      let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
      const user_id = Number(payload.id);

      if (!user_id) return c.json({ message: "Invalid user identifier" }, 400);

      const { db } = createClient(c.env);

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
            item: newItem,
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
  },
);
