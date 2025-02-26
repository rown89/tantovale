import { eq } from "drizzle-orm";
import { createWranglerDb } from "#database/db";
import { users } from "#database/schema";
import type { Context } from "hono";
import type { AppBindings } from "./types";

export const checkUser = async (
  c: Context<AppBindings>,
  identifier: string,
  type: "email" | "username",
) => {
  const { db } = createWranglerDb(c.env);

  const user = await db
    .select()
    .from(users)
    .where(eq(users[type], identifier))
    .limit(1);

  return user?.[0];
};
