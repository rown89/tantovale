import { createClient } from "#database/index";
import { users } from "#database/schema/users";
import type { AppBindings } from "#lib/types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

export const usersRoute = new Hono<AppBindings>().get("/:id{[0-9]+}", (c) => {
  const id = c.req.param("id");

  try {
    const { db } = createClient(c.env);

    const user = db
      .select()
      .from(users)
      .where(eq(users.id, Number(id)))
      .limit(1);

    if (!user) return c.json([], 404);

    return c.json(user, 200);
  } catch (error) {
    return c.json({ message: "usersRoute error" }, 500);
  }
});
