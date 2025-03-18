import { eq } from "drizzle-orm";
import { createClient } from "@workspace/database/db";
import { users } from "@workspace/database/schemas/schema";
import type { Context } from "hono";

import type { AppBindings } from "./types";

export const checkUser = async (
  c: Context<AppBindings>,
  identifier: string,
  type: "email" | "username",
) => {
  const { db } = createClient();

  const user = await db
    .select()
    .from(users)
    .where(eq(users[type], identifier))
    .limit(1);

  return user?.[0];
};
