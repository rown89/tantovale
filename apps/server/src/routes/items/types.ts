import * as z from "zod";
import type itemSchema from "../../schema/items";

type ItemssType = z.infer<typeof itemSchema>;
export type { ItemssType };
