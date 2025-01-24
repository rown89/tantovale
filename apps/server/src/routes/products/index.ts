import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import productsSchema, { createProductSchema } from "./schema";

const products = [
  {
    id: 1,
    title: "Product 1",
    price: 100,
  },
  {
    id: 2,
    title: "Product 2",
    price: 200,
  },
  {
    id: 3,
    title: "Product 3",
    price: 300,
  },
];

export const productsRoute = new Hono()
  .get("/", (c) => {
    return c.json({ products });
  })
  .get("/:id{[0-9]+}", (c) => {
    const id = c.req.param("id");

    const product = products.find((p) => p.id === Number(id));

    if (!product) {
      return c.notFound();
    }

    return c.json({ product });
  })
  .post("/", zValidator("json", createProductSchema), async (c) => {
    const data = await c.req.valid("json");

    return c.json(data);
  })
  .put("/", zValidator("json", productsSchema), async (c) => {
    const data = await c.req.valid("json");

    return c.json(data);
  })
  .delete("/:id{[0-9]+}", (c) => {
    const id = c.req.param("id");

    const product = products.find((p) => p.id === Number(id));

    if (!product) {
      return c.notFound();
    }

    const deletedProduct = products.splice(products.indexOf(product), 1);

    return c.json({ product: deletedProduct });
  });
