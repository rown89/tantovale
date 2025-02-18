// src/routes/refresh.ts
import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { verify, sign } from "hono/jwt";
import { env } from "hono/adapter";
import { db } from "@workspace/database/db";
import { refreshTokens } from "@workspace/database/schema";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import {
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
} from "@/lib/constants";
import { generateToken } from "@/lib/generateTokens";
import { getTokenOptions } from "@/lib/getTokenOptions";

type Bindings = {
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
    const { REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
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

      const new_refresh_token_payload = generateToken({
        id: Number(payload.id),
        username,
        exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
      });

      const new_refresh_token = await sign(
        new_refresh_token_payload,
        c.env.REFRESH_TOKEN_SECRET,
      );

      // Store refresh token in DB
      try {
        await db.insert(refreshTokens).values({
          username,
          token: new_refresh_token,
          expires_at: DEFAULT_REFRESH_TOKEN_EXPIRES,
        });

        await setSignedCookie(
          c,
          "refresh_token",
          refresh_token,
          c.env.COOKIE_SECRET,
          {
            ...getTokenOptions("refresh_token"),
          },
        );
      } catch (error) {
        console.error("Error storing refresh token in DB:", error);
        return c.json({ message: "An error occurred during login" }, 500);
      }

      console.log("Tokens refreshed successfully");

      return c.json({ message: "Tokens refreshed successfully" });
    } catch (error) {
      console.error("Error refreshing tokens:", error);
      return c.json({ message: "Error refreshing tokens" }, 500);
    }
  },
);
