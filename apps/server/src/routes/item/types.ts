import { selectFilterValuesSchema } from "#database/schema/filter_values";
import { selectFilterSchema } from "#database/schema/filters";
import { insertItemsSchema } from "#database/schema/items";
import { z } from "zod";

export const propertySchema = z.object({
  name: selectFilterSchema.shape.slug,
  value: selectFilterValuesSchema.shape.value,
});

export const createItemSchema = z.object({
  commons: insertItemsSchema,
  properties: z.array(propertySchema),
});
