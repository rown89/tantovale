import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { insertItemsSchema as insertCommonItemsSchema } from "#database/schema/items";
import { createClient } from "#database/db";
import { subcategories } from "#database/schema/subcategories";
import { Filters } from "#database/scripts/seeders/categories/constants";
import { subCategoryFilters } from "#database/schema/subcategory_filters";
import { filters, selectFilterSchema } from "#database/schema/filters";
import { selectFilterValuesSchema } from "#database/schema/filter_values";

import type { AppBindings } from "#lib/types";

// example:
const reqObject = {
  commons: {
    title: "blabbla",
    description: "blalblalblalblalbla bla",
    subcategory_id_: 1,
    // ...
  },
  properties: [{ name: Filters.CONDITION, value: "new" }],
};

const propertySchema = z.object({
  name: selectFilterSchema.shape.slug,
  value: selectFilterValuesSchema.shape.value,
});

export const createItemSchema = z.object({
  commons: insertCommonItemsSchema,
  properties: z.array(propertySchema),
});

export const itemCreateRoute = new Hono<AppBindings>().post(
  "/create",
  zValidator("json", createItemSchema),
  async (c) => {
    const { db } = createClient(c.env);

    const data = c.req.valid("json");

    const availableSubcategories = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.id, data.commons.subcategory_id));

    if (!availableSubcategories?.length) {
      return c.json({
        message: `SubCategory ${data.commons.subcategory_id} doesnt exist`,
      });
    }

    const subcategoryFilters = await db
      .select()
      .from(subCategoryFilters)
      .innerJoin(filters, eq(filters.id, data.commons.subcategory_id));

    console.log(subcategoryFilters);

    // TODO: Check with AI if the item contains problematic resoruces, if not set published to true

    /* 

    let finalSchema: ZodObject<any>;

    const requestedSubCategory = availableSubcategories.find(
      (cat) => cat.id === data.commons.subcategory_id,
    );

    // laptops rules
    if (requestedSubCategory?.name === Subcategories.LAPTOPS) {
      // Cross check if the received properties:{} exist in the subcategory_filters  
    }

    // smartphone rules
    if (requestedSubCategory?.name === Subcategories.PHONES) {
    } 

    */

    return c.json(data);
  },
);
