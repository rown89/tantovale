import { eq } from "drizzle-orm";
import { createDb } from "database";
import { users } from "database/schema/schema";
import type { Context } from "hono";
import type { Env } from "hono-pino";

export const checkUser = async (
  c: Context,
  identifier: string,
  type: "email" | "username",
) => {
  const { db } = createDb(c.env);

  const user = await db
    .select()
    .from(users)
    .where(eq(users[type], identifier))
    .limit(1);

  return user?.[0];
};
