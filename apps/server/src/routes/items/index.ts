import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppBindings } from "#lib/types";
import { insertItemsSchema } from "#database/schema/items";

export const itemsRoute = new Hono<AppBindings>().post(
  "/",
  zValidator("json", insertItemsSchema),
  async (c) => {
    const data = await c.req.valid("json");

    return c.json(data);
  },
);
