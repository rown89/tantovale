import z from "zod";

const productsSchema = z.object({
  id: z.number().positive().min(1),
  title: z.string().min(10),
  price: z.number().positive(),
});

const createProductSchema = productsSchema.omit({ id: true });

export { productsSchema, createProductSchema };
