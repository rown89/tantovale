import { eq } from "drizzle-orm";
import { db } from "@workspace/database/db";
import { users } from "@workspace/database/schema";

export const checkUser = async (
  identifier: string,
  type: "email" | "username",
) => {
  const user = await db
    .select()
    .from(users)
    .where(eq(users[type], identifier))
    .limit(1);

  return user?.[0];
};
