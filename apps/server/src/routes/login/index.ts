// src/routes/login.ts
import { Hono } from "hono";
import { db } from "@workspace/database/db";
import { users, refreshTokens } from "@workspace/database/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "../../lib/password";
import { zValidator } from "@hono/zod-validator";
import { UserSchema } from "../../schema/users";
import { env } from "hono/adapter";
import { generateAndSetTokens } from "../../lib/generateTokens";

type Bindings = {
  ACCESS_TOKEN_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  COOKIE_SECRET: string;
  SERVER_HOSTNAME: string;
};

export const loginRoute = new Hono<{ Bindings: Bindings }>().post(
  "/",
  zValidator("json", UserSchema),
  async (c) => {
    console.log(c.env.SERVER_HOSTNAME);

    const {
      ACCESS_TOKEN_SECRET,
      REFRESH_TOKEN_SECRET,
      COOKIE_SECRET,
      SERVER_HOSTNAME,
    } = env<{
      ACCESS_TOKEN_SECRET: string;
      REFRESH_TOKEN_SECRET: string;
      COOKIE_SECRET: string;
      SERVER_HOSTNAME: string;
    }>(c);

    const { email, password } = await c.req.json();

    // lookup email in database
    const userFromDb = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // handle email not found
    if (!userFromDb.length) {
      return c.json({ message: "invalid email or password" });
    }

    // handle invalid password
    const verifyResult = await verifyPassword(
      userFromDb?.[0]?.password,
      password,
    );

    if (!verifyResult) {
      return c.json({ message: "invalid username or password" });
    }

    const { refreshToken } = await generateAndSetTokens({
      c,
      id: userFromDb?.[0]?.id!,
      email,
      token_secret: ACCESS_TOKEN_SECRET,
      refresh_token_secret: REFRESH_TOKEN_SECRET,
      cookie_secret: COOKIE_SECRET,
      hostname: SERVER_HOSTNAME,
    });

    // Store refresh token in DB
    const newRefreshToken = await db
      .insert(refreshTokens)
      .values({
        email,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
      .returning();

    if (!newRefreshToken || !newRefreshToken.length) {
      console.error("Error storing refresh token in DB:", refreshToken);
      return c.json({ message: "An error occurred during login" }, 500);
    }

    return c.json({ message: "login successful" });
  },
);
