import { Hono } from "hono";
import { deleteCookie, getCookie, getSignedCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { env } from "hono/adapter";
import { createDb } from "@/database/db";
import { refreshTokens } from "@/database/schema";
import { eq } from "drizzle-orm";
import type { AppBindings } from "@/lib/types";

export const logoutRoute = new Hono<AppBindings>().post("/", async (c) => {
  const { REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
    ACCESS_TOKEN_SECRET: string;
    REFRESH_TOKEN_SECRET: string;
    COOKIE_SECRET: string;
  }>(c);

  try {
    // Get the refresh token from the cookie
    /*
        const refreshToken = await getSignedCookie(
          c,
          "refresh_token",
          COOKIE_SECRET,
        );
    */

    const refreshToken = getCookie(c, "refresh_token");
    console.log("\nrefreshToken: ", refreshToken, "\n");

    if (refreshToken) {
      try {
        // Verify the refresh token to get the username
        const payload = await verify(refreshToken, REFRESH_TOKEN_SECRET);
        const username = payload.username as string;

        const { db } = createDb(c.env);
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
