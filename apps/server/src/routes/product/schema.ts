import z from "zod";

const productSchema = z.object({
  id: z.number().positive().min(1),
  title: z.string().min(10),
  price: z.number().positive(),
});

const createProductSchema = productSchema.omit({ id: true });

export { productSchema, createProductSchema };
