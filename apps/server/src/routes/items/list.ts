import { createRouter } from "#lib/create-app";

export const itemsRoute = createRouter().get("/", async (c) => {
  return c.json({ items: [] });
});
