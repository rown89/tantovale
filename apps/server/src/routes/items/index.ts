import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppBindings } from "#lib/types";
import { insertItemsSchema as commonItemsSchema } from "#database/schema/items";
import { createClient } from "#database/db";
import type { ZodObject } from "zod";
import { subcategories } from "#database/schema/subcategories";
import {
  Filters,
  Subcategories,
  SUBCATEGORIES_FILTERS,
  type FiltersTypes,
  type SubcategoryTypes,
} from "#database/scripts/seeders/categories/constants";

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

export const itemsRoute = new Hono<AppBindings>().post(
  "/create",
  zValidator("json", commonItemsSchema),
  async (c) => {
    let finalSchema: ZodObject<any>;

    const data = c.req.valid("json");

    const availableSubcategories = await createClient(c.env)
      .db.select()
      .from(subcategories);

    if (!availableSubcategories?.length) return;

    const currentSubCategory = availableSubcategories.find(
      (cat) => cat.id === data.subcategory_id,
    );

    const TEST = SUBCATEGORIES_FILTERS.reduce(
      (acc, { filterSlug, subcategories }) => {
        subcategories.forEach(({ slug }) => {
          if (!acc[slug]) {
            acc[slug] = [];
          }
          acc[slug].push(filterSlug as FiltersTypes);
        });

        return acc;
      },
      {} as Record<SubcategoryTypes, FiltersTypes[]>,
    );

    if (currentSubCategory) {
      const isSubcatAccessories = currentSubCategory.name.includes(
        Subcategories.ACCESSORIES,
      );

      if (isSubcatAccessories) {
        // TODO: check for dynamic accessories-NAME
      }

      const subcategoryFitlers =
        TEST[currentSubCategory?.name as SubcategoryTypes];

      console.log(subcategoryFitlers);
    }

    // laptops rules
    if (currentSubCategory?.name === Subcategories.LAPTOPS) {
      /* 
        Cross check if the received properties:{} exist in the subcategory_filters  
      */
    }

    // smartphone rules
    if (currentSubCategory?.name === Subcategories.PHONES) {
    }

    return c.json(data);
  },
);
