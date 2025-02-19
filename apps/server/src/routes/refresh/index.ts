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
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
} from "@/lib/constants";
import { tokenPayload } from "@/lib/tokenPayload";
import { getAuthTokenOptions } from "@/lib/getAuthTokenOptions";

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
    const { REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
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

      // Check if the refresh token exists in db
      const storedToken = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.username, username));

      // Token doesn't exist or doesn't match - possible reuse detected
      if (!storedToken || storedToken?.[0]?.token !== refresh_token) {
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.username, username));

        return c.json({ message: "Invalid refresh token" }, 401);
      }

      const new_access_token_payload = tokenPayload({
        id: Number(payload.id),
        username,
        exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
      });

      const new_refresh_token_payload = tokenPayload({
        id: Number(payload.id),
        username,
        exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
      });

      const new_access_token = await sign(
        new_access_token_payload,
        c.env.ACCESS_TOKEN_SECRET,
      );

      const new_refresh_token = await sign(
        new_refresh_token_payload,
        c.env.REFRESH_TOKEN_SECRET,
      );

      // Store new refresh token in DB
      try {
        await db.insert(refreshTokens).values({
          username,
          token: new_refresh_token,
          expires_at: DEFAULT_REFRESH_TOKEN_EXPIRES,
        });
      } catch (error) {
        console.error("Error storing refresh token in DB:", error);
        return c.json({ message: "An error occurred during login" }, 500);
      }

      await setSignedCookie(
        c,
        "access_token",
        new_access_token,
        c.env.COOKIE_SECRET,
        {
          ...getAuthTokenOptions("access_token"),
        },
      );

      await setSignedCookie(
        c,
        "refresh_token",
        new_refresh_token,
        c.env.COOKIE_SECRET,
        { ...getAuthTokenOptions("refresh_token") },
      );

      console.log("Tokens refreshed successfully");

      return c.json(
        {
          message: "Tokens refreshed successfully",
          access_token: new_access_token,
        },
        200,
      );
    } catch (error) {
      console.error("Error refreshing tokens:", error);
      return c.json({ message: "Error refreshing tokens" }, 500);
    }
  },
);
