// src/routes/refresh.ts
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { env } from "hono/adapter";
import { createDb } from "database";
import { refreshTokens } from "database/schema/schema";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { DEFAULT_REFRESH_TOKEN_EXPIRES } from "@/lib/constants";
import { setAuthTokens } from "@/lib/tokenPayload";
import type { AppBindings } from "@/lib/types";

export const refreshRoute = new Hono<AppBindings>().post(
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
    const refresh_token = getCookie(c, "refresh_token");
    try {
      // Get the refresh token from the cookie
      /* 
      const refresh_token = await getSignedCookie(
        c,
        COOKIE_SECRET,
        "refresh_token",
      );
      */
      if (!refresh_token) {
        return c.json({ message: "No refresh token provided" }, 401);
      }

      // Verify the refresh token
      const payload = await verify(refresh_token, REFRESH_TOKEN_SECRET);
      const username = payload.username as string;

      const { db } = createDb(c.env);
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

      const authTokensPayload = {
        c,
        id: Number(payload.id),
        username: username,
        email_verified: payload.email_verified as boolean,
        phone_verified: payload.phone_verified as boolean,
      };

      const {
        access_token: new_access_token,
        refresh_token: new_refresh_token,
      } = await setAuthTokens(authTokensPayload);

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

      console.log("Tokens refreshed successfully");

      return c.json(
        {
          message: "Tokens refreshed successfully",
          access_token: new_access_token,
          refresh_token: new_refresh_token,
        },
        200,
      );
    } catch (error) {
      console.error("Error refreshing tokens:", error);
      return c.json({ message: "Error refreshing tokens" }, 500);
    }
  },
);
