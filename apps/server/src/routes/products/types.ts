import z from "zod";
import type { productsSchema } from "./schema.js";

type ProductsType = z.infer<typeof productsSchema>;
export type { ProductsType };
