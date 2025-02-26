import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { createWranglerDb } from "#database/db";
import { refreshTokens } from "#database/schema";
import { eq } from "drizzle-orm";
import type { AppBindings } from "#lib/types";

export const logoutRoute = new Hono<AppBindings>().post("/", async (c) => {
  const { REFRESH_TOKEN_SECRET, COOKIE_SECRET } = c.env;

  try {
    // Get the refresh token from the cookie
    const refreshToken = getCookie(c, "refresh_token");

    if (refreshToken) {
      try {
        // Verify the refresh token to get the username
        const payload = await verify(refreshToken, REFRESH_TOKEN_SECRET);
        const username = payload.username as string;

        const { db } = createWranglerDb(c.env);
        // Remove refresh token
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.username, username));
      } catch (error) {
        console.log("XXXXXXXXXXXXXXXX", error);
      }
    }

    // Delete cookies
    deleteCookie(c, "access_token");
    deleteCookie(c, "refresh_token");

    return c.json({ message: "Logout successful" }, 200);
  } catch (error) {
    console.error("Error during logout:", error);
    return c.json({ message: "Error during logout" }, 500);
  }
});
