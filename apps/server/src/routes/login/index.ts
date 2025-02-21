import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { env } from "hono/adapter";
import { UserSchema } from "@/schema/users";
import { setAuthTokens, tokenPayload } from "@/lib/tokenPayload";
import { verifyPassword } from "@/lib/password";
import { createDb } from "database";
import { users, refreshTokens } from "database/schema/schema";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
} from "@/lib/constants";
import { sign } from "hono/jwt";
import { setCookie } from "hono/cookie";
import { getAuthTokenOptions } from "@/lib/getAuthTokenOptions";
import type { AppBindings } from "@/lib/types";

export const loginRoute = new Hono<AppBindings>().post(
  "/",
  zValidator("json", UserSchema.omit({ username: true })),
  async (c) => {
    const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
      REFRESH_TOKEN_SECRET: string;
      COOKIE_SECRET: string;
    }>(c);

    const { email, password } = await c.req.json();

    const { db } = createDb(c.env);
    // lookup email in database
    const userFromDb = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = userFromDb?.[0];

    // handle email not found
    if (!user) {
      return c.json({ message: "invalid email or password" }, 500);
    }

    // handle invalid password
    const verifyResult = await verifyPassword(user?.password, password);
    if (!verifyResult) {
      return c.json({ message: "invalid email or password" }, 500);
    }

    const { id, username, email_verified, phone_verified } = user;

    if (!email_verified) {
      return c.json(
        { message: "Please verify your email before logging in" },
        500,
      );
    }

    const access_token_payload = tokenPayload({
      id,
      username,
      email_verified,
      phone_verified,
      exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
    });

    const refresh_token_payload = tokenPayload({
      id,
      username,
      email_verified,
      phone_verified,
      exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
    });

    // Generate and sign tokens
    const access_token = await sign(access_token_payload, ACCESS_TOKEN_SECRET);
    const refresh_token = await sign(
      refresh_token_payload,
      REFRESH_TOKEN_SECRET,
    );

    setCookie(c, "access_token", access_token, {
      ...getAuthTokenOptions("access_token"),
    });

    setCookie(c, "refresh_token", refresh_token, {
      ...getAuthTokenOptions("refresh_token"),
    });

    // Store refresh token in DB
    const newRefreshToken = await db
      .insert(refreshTokens)
      .values({
        username: user.username,
        token: refresh_token,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
      .returning();

    if (!newRefreshToken || !newRefreshToken.length) {
      console.error("Error storing refresh token in DB:", refresh_token);
      return c.json({ message: "An error occurred during login" }, 500);
    }

    return c.json(
      {
        message: "login successful",
        user: {
          id,
          username,
          email_verified,
          phone_verified,
        },
      },
      200,
    );
  },
);
