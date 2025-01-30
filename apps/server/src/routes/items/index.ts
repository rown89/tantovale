import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import itemSchema, { createItemSchema } from "./schema";

const items = [
  {
    id: 1,
    title: "item 1",
    price: 100,
  },
  {
    id: 2,
    title: "item 2",
    price: 200,
  },
  {
    id: 3,
    title: "item 3",
    price: 300,
  },
];

export const itemsRoute = new Hono()
  .get("/", (c) => {
    return c.json({ items });
  })
  .get("/:id{[0-9]+}", (c) => {
    const id = c.req.param("id");

    const item = items.find((p) => p.id === Number(id));

    if (!item) {
      return c.notFound();
    }

    return c.json({ item });
  })
  .post("/", zValidator("json", createItemSchema), async (c) => {
    const data = await c.req.valid("json");

    return c.json(data);
  })
  .put("/", zValidator("json", itemSchema), async (c) => {
    const data = await c.req.valid("json");

    return c.json(data);
  })
  .delete("/:id{[0-9]+}", (c) => {
    const id = c.req.param("id");

    const item = items.find((p) => p.id === Number(id));

    if (!item) {
      return c.notFound();
    }

    const deletedItem = items.splice(items.indexOf(item), 1);

    return c.json({ deletedItem });
  });
