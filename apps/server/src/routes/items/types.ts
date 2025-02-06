import * as z from "zod";
import type itemSchema from "./schema";

type ItemssType = z.infer<typeof itemSchema>;
export type { ItemssType };
