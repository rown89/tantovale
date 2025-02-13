import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
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

/**
 * Deletes a cookie by setting its expiration to the past.
 * @param c - Hono Context
 * @param name - Name of the cookie to delete
 */
export const deleteCookie = (c: Context, name: string) => {
  setCookie(c, name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0, // Immediately expires the cookie
    expires: new Date(0), // Set to the past
  });
};
