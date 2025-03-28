import type { Context, Next } from "hono";
import { verify, sign } from "hono/jwt";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "hono/adapter";

import type { AppBindings } from "#lib/types";
import { createClient, type DrizzleClient } from "@workspace/database/db";
import { eq } from "drizzle-orm";
import { users } from "@workspace/database/schemas/users";
import { refreshTokens } from "@workspace/database/schemas/refreshTokens";
import { tokenPayload } from "#lib/tokenPayload";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES,
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  getNodeEnvMode,
} from "#utils/constants";
import { getAuthTokenOptions } from "#lib/getAuthTokenOptions";

// Helper function to clean up and invalidate tokens
async function invalidateTokens(
  c: Context<AppBindings>,
  db: DrizzleClient["db"],
) {
  const refresh_token = getCookie(c, "refresh_token");

  if (refresh_token) {
    // Delete refresh token from database if it exists
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.token, refresh_token));
  }

  // Remove cookies
  deleteCookie(c, "access_token");
  deleteCookie(c, "refresh_token");
}

// Helper function to verify and get refresh token details
async function validateRefreshToken(
  c: Context<AppBindings>,
  db: DrizzleClient["db"],
) {
  const refresh_token = getCookie(c, "refresh_token");

  if (!refresh_token) {
    throw new Error("No refresh token");
  }

  const storedRefreshToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.token, refresh_token),
  });

  if (!storedRefreshToken) {
    throw new Error("Invalid refresh token");
  }

  const refreshTokenExpiry = new Date(storedRefreshToken.expires_at);
  if (refreshTokenExpiry < new Date()) {
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.token, refresh_token));
    throw new Error("Refresh token expired");
  }

  return storedRefreshToken;
}

// Helper function to create a new access token
async function createNewAccessToken(
  c: Context<AppBindings>,
  db: DrizzleClient["db"],
  username: string,
  ACCESS_TOKEN_SECRET: string,
  isProductionMode: boolean,
) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  const access_token_payload = tokenPayload({
    id: existingUser.id,
    username: existingUser.username,
    email_verified: existingUser.email_verified,
    phone_verified: existingUser.phone_verified,
    exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS(),
  });

  const new_access_token = await sign(
    access_token_payload,
    ACCESS_TOKEN_SECRET,
  );

  // Set the new access token in cookies
  setCookie(c, "access_token", new_access_token, {
    ...getAuthTokenOptions({
      isProductionMode,
      expires: DEFAULT_ACCESS_TOKEN_EXPIRES(),
    }),
  });

  return {
    user: {
      id: existingUser.id,
      username: existingUser.username,
      email_verified: existingUser.email_verified,
      phone_verified: existingUser.phone_verified,
    },
    payload: access_token_payload,
  };
}

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
  const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, NODE_ENV } = env<{
    ACCESS_TOKEN_SECRET: string;
    REFRESH_TOKEN_SECRET: string;
    NODE_ENV: string;
  }>(c);

  const { isProductionMode } = getNodeEnvMode(NODE_ENV);
  const { db } = createClient();

  try {
    const access_token = getCookie(c, "access_token");
    const refresh_token = getCookie(c, "refresh_token");

    // Check if both tokens are present
    if (!access_token || !refresh_token) {
      await invalidateTokens(c, db);
      return c.json({ message: "Unauthorized - No Token" }, 401);
    }

    let payload;
    let tokenExpired = false;

    try {
      // Verify access token
      payload = await verify(access_token, ACCESS_TOKEN_SECRET);
      const exp = Number(payload?.exp);
      tokenExpired = exp * 1000 < Date.now();
    } catch (error) {
      tokenExpired = true;
    }

    // If access token is expired, attempt to refresh
    if (tokenExpired) {
      try {
        // Validate refresh token
        const storedRefreshToken = await validateRefreshToken(c, db);

        // Create new access token
        const tokenResult = await createNewAccessToken(
          c,
          db,
          storedRefreshToken.username,
          ACCESS_TOKEN_SECRET,
          isProductionMode,
        );

        payload = tokenResult.payload;

        c.set("user", tokenResult.user);
      } catch (error) {
        await invalidateTokens(c, db);

        return c.json(
          { message: `Unauthorized - storedRefreshToken error` },
          401,
        );
      }
    } else {
      // Validate user for non-expired access token
      const user_id = Number(payload?.id);
      const existingUser = await db.query.users.findFirst({
        where: eq(users.id, user_id),
      });

      if (!existingUser) {
        await invalidateTokens(c, db);
        return c.json({ message: "Unauthorized - User not found" }, 401);
      }

      // Set user in context
      c.set("user", {
        id: existingUser.id,
        username: existingUser.username,
        email_verified: existingUser.email_verified,
        phone_verified: existingUser.phone_verified,
      });
    }

    await next();
  } catch (error) {
    console.error("Auth Middleware Error:\n", error, "\n");
    await invalidateTokens(c, db);
    return c.json({ message: "Authentication failed" }, 401);
  }
}
