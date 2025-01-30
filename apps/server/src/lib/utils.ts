import { db } from "@tantovale/database/db";
import { users } from "@tantovale/database/schema";
import { eq } from "drizzle-orm";
import type { Context } from "hono";

import { setCookie } from "hono/cookie";

export const checkEmail = async (email: string) => {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
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
