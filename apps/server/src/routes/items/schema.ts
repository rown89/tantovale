import * as z from "zod";

const itemsSchema = z.object({
  id: z.number().positive().min(1),
  title: z.string().min(10),
  price: z.number().positive(),
});

const createItemSchema = itemsSchema.omit({ id: true });

export default itemsSchema;

export { createItemSchema };
