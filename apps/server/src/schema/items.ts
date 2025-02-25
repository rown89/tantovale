import * as z from "zod";

export const itemsSchema = z.object({
  id: z.number().positive().min(1),
  title: z.string().min(10),
  price: z.number().positive(),
});

export const createItemSchema = itemsSchema.omit({ id: true });
