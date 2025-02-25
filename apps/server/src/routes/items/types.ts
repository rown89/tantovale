import * as z from "zod";
import type { itemsSchema } from "../../schema/items";

export type ItemssType = z.infer<typeof itemsSchema>;
