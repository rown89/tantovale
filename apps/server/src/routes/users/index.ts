import type { AppBindings } from "#lib/types";
import { Hono } from "hono";

export const usersRoute = new Hono<AppBindings>()
  .get("/", (c) => {
    return c.json({});
  })
  .get("/:id{[0-9]+}", (c) => {
    const id = c.req.param("id");

    return c.json({});
  });
