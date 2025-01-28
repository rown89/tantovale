import * as z from "zod";
import type productsSchema from "./schema";

type ProductsType = z.infer<typeof productsSchema>;
export type { ProductsType };
