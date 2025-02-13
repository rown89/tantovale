// src/routes/refresh.ts
import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { verify, sign } from "hono/jwt";
import { env } from "hono/adapter";
import { db } from "@workspace/database/db";
import { refreshTokens } from "@workspace/database/schema";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { isProductionMode } from "@/lib/constants";

type Bindings = {
  ACCESS_TOKEN_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  COOKIE_SECRET: string;
};

export const refreshRoute = new Hono<{ Bindings: Bindings }>().post(
  "/",
  describeRoute({
    description: "Refresh token verifier",
    responses: {
      200: {
        description: "Tokens refreshed successfully",
      },
    },
  }),
  async (c) => {
    const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
      REFRESH_TOKEN_SECRET: string;
      COOKIE_SECRET: string;
    }>(c);

    try {
      // Get the refresh token from the cookie
      const refresh_token = await getSignedCookie(
        c,
        COOKIE_SECRET,
        "refresh_token",
      );

      if (!refresh_token) {
        return c.json({ message: "No refresh token provided" }, 401);
      }

      // Verify the refresh token
      const payload = await verify(refresh_token, REFRESH_TOKEN_SECRET);
      const username = payload.username as string;

      // Check if the refresh token exists in Redis
      const storedToken = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.username, username));

      if (!storedToken || storedToken?.[0]?.token !== refresh_token) {
        // Token doesn't exist or doesn't match - possible reuse detected
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.username, username));
        return c.json({ message: "Invalid refresh token" }, 401);
      }

      // Create new access token
      const newAccessToken = await sign(
        {
          id: payload.id,
          username,
          tokenOrigin: "/auth/refresh",
          //exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
          exp: Math.floor(Date.now() / 1000) + 5, // 5 seconds
        },
        ACCESS_TOKEN_SECRET,
      );

      // Create new refresh token
      const newRefreshToken = await sign(
        {
          id: payload.id,
          username,
          tokenOrigin: "/auth/refresh",
          exp: Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60, // 15 days
        },
        REFRESH_TOKEN_SECRET,
      );

      // Store refresh token in DB
      try {
        await db.insert(refreshTokens).values({
          username,
          token: newRefreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry
        });
      } catch (error) {
        console.error("Error storing refresh token in DB:", error);
        return c.json({ message: "An error occurred during login" }, 500);
      }

      // Set new tokens in cookies
      await setSignedCookie(c, "auth_token", newAccessToken, COOKIE_SECRET, {
        path: "/",
        secure: isProductionMode,
        httpOnly: true,
        //maxAge: 15 * 60 * 1000, // 15 minutes
        sameSite: "Strict",
      });

      await setSignedCookie(
        c,
        "refresh_token",
        newRefreshToken,
        COOKIE_SECRET,
        {
          path: "/",
          secure: isProductionMode,
          httpOnly: true,
          //maxAge: 24 * 60 * 60 * 1000, // 24 hours
          sameSite: "Strict",
        },
      );

      console.log("Tokens refreshed successfully");

      return c.json({ message: "Tokens refreshed successfully" });
    } catch (error) {
      console.error("Error refreshing tokens:", error);
      return c.json({ message: "Error refreshing tokens" }, 500);
    }
  },
);
