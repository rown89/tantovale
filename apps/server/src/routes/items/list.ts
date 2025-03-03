import { Hono } from "hono";
import type { AppBindings } from "#lib/types";

export const itemsRoute = new Hono<AppBindings>().get("/", async (c) => {
  return c.json({ items: [] });
});
