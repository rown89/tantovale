import { selectFilterValuesSchema } from "#database/schema/filter_values";
import { selectFilterSchema } from "#database/schema/filters";
import { items } from "#database/schema/items";
import { createInsertSchema } from "drizzle-zod";
import { number, z } from "zod";

export const propertySchema = z.object({
  id: selectFilterSchema.shape.id,
  name: selectFilterSchema.shape.slug,
  value: selectFilterValuesSchema.shape.value,
});

export const createItemSchema = z.object({
  commons: createInsertSchema(items, {
    title: (schema) => schema.min(5).max(180),
    description: (schema) => schema.min(100).max(800),
    price: number().min(0.01),
  }).omit({
    user_id: true,
    published: true,
    status: true,
    created_at: true,
    updated_at: true,
  }),
  properties: z.array(propertySchema),
});
