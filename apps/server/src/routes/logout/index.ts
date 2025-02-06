// src/routes/logout.ts
import { Hono } from "hono";
import { deleteCookie, getSignedCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { env } from "hono/adapter";
import { db } from "@workspace/database/db";
import { refreshTokens } from "@workspace/database/schema";
import { eq } from "drizzle-orm";

type Bindings = {
  ACCESS_TOKEN_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  COOKIE_SECRET: string;
};

export const logoutRoute = new Hono<{ Bindings: Bindings }>().post(
  "/",
  async (c) => {
    const { REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
      REFRESH_TOKEN_SECRET: string;
      COOKIE_SECRET: string;
    }>(c);

    try {
      // Get the refresh token from the cookie
      const refreshToken = await getSignedCookie(
        c,
        "refresh_token",
        COOKIE_SECRET,
      );

      if (refreshToken) {
        // Verify the refresh token to get the username
        const payload = await verify(refreshToken, REFRESH_TOKEN_SECRET);
        const email = payload.email as string;

        // Remove refresh token
        await db.delete(refreshTokens).where(eq(refreshTokens.email, email));
      }

      // Delete cookies
      await deleteCookie(c, "auth_token", {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      });
      await deleteCookie(c, "refresh_token", {
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      });

      return c.json({ message: "Logout successful" });
    } catch (error) {
      console.error("Error during logout:", error);
      return c.json({ message: "Error during logout" }, 500);
    }
  },
);
