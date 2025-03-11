import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { createClient } from "#database/db";
import { subcategories } from "#database/schema/subcategories";
import { subCategoryFilters } from "#database/schema/subcategory_filters";

import type { AppBindings } from "#lib/types";
import { createItemSchema } from "../../schema";
import { items } from "#database/schema/items";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { itemsFiltersValues } from "#database/schema/items_filter_values";

export const itemRoute = new Hono<AppBindings>().post(
  "/create",
  zValidator("json", createItemSchema),
  async (c) => {
    const { ACCESS_TOKEN_SECRET } = c.env;
    const data = c.req.valid("json");
    const accessToken = getCookie(c, "access_token");

    if (!accessToken) {
      return c.json({ message: "Invalid access token" }, 500);
    }

    const { db } = createClient(c.env);

    const availableSubcategories = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.id, data.commons.subcategory_id));

    // if data.commons.subcategory_id doesnt exist
    if (!availableSubcategories?.length) {
      return c.json(
        {
          message: `SubCategory ${data.commons.subcategory_id} doesnt exist`,
        },
        400,
      );
    }

    const payload = await verify(accessToken, ACCESS_TOKEN_SECRET);
    const user_id = Number(payload.id);

    const newItem = await db
      .insert(items)
      .values({
        ...data.commons,
        user_id,
        status: "available",
        published: true,
      })
      .returning();

    // if we have data.properties them item has filters connected
    if (data?.properties?.length) {
      const subcategoryFilters = await db
        .select()
        .from(subCategoryFilters)
        .where(
          eq(subCategoryFilters.subcategory_id, data.commons.subcategory_id),
        );

      // Extract valid filter IDs from the fetched filters
      const validFilterIds = new Set(
        subcategoryFilters.map((f) => f.filter_id),
      );

      // Check if every property id exists in validFilterIds
      const invalidProperties = data.properties.filter(
        (p) => !validFilterIds.has(p.id),
      );

      if (invalidProperties.length) {
        return c.json(
          {
            message: "Some properties have invalid filter IDs",
            invalidProperties,
          },
          400,
        );
      }

      if (newItem.length && newItem?.[0]?.id) {
        const insertFilterValues = await db
          .insert(itemsFiltersValues)
          .values(
            data.properties.map((property) => ({
              item_id: newItem[0]!.id,
              filter_value_id: property.id,
            })),
          )
          .returning();
      }
    }

    // TODO: Check with AI if the item contains problematic resoruces, if not set published to true

    return c.json(data, 201);
  },
);
