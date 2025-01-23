import z from "zod";
import type { productSchema } from "./schema.js";

type ProductType = z.infer<typeof productSchema>;
export type { ProductType };
