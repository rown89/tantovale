import { deleteCookie, getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { createClient } from "@workspace/database/db";
import { refreshTokens } from "@workspace/database/schemas/refreshTokens";
import { eq } from "drizzle-orm";
import { env } from "hono/adapter";
import { createRouter } from "#lib/create-app";

export const logoutRoute = createRouter().post("/", async (c) => {
  const { REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
    REFRESH_TOKEN_SECRET: string;
    COOKIE_SECRET: string;
  }>(c);

  // Get the refresh token from the cookie
  const refreshToken = getCookie(c, "refresh_token");

  console.log("refreshToken", refreshToken);

  if (!refreshToken) {
    return c.json({ message: "Logout error - no refresh token" }, 401);
  }

  try {
    // Verify the refresh token to get the username
    const payload = await verify(refreshToken, REFRESH_TOKEN_SECRET);
    const username = payload.username as string;

    const { db } = createClient();
    // Remove refresh token
    await db.delete(refreshTokens).where(eq(refreshTokens.username, username));

    // Delete cookies
    deleteCookie(c, "access_token");
    deleteCookie(c, "refresh_token");

    return c.json({ message: "Logout successful" }, 200);
  } catch (error) {
    return c.json({ message: "Logout error" }, 401);
  }
});
