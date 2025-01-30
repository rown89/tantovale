// src/routes/login.ts
import { Hono } from "hono";
import { db } from "@tantovale/database/db";
import { users, refreshTokens } from "@tantovale/database/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "../../lib/password";
import { zValidator } from "@hono/zod-validator";
import { UserSchema } from "../users/schema";
import { env } from "hono/adapter";
import { generateAndSetTokens } from "../../lib/generateTokens";

export const loginRoute = new Hono().post(
  "/",
  zValidator("json", UserSchema.omit({ firstName: true, lastName: true })),
  async (c) => {
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

    // lookup username in database
    const userFromDb = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // handle username not found
    if (userFromDb.length === 0) {
      return c.json({ message: "invalid username or password" });
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
    try {
      await db.insert(refreshTokens).values({
        email,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry
      });
    } catch (error) {
      console.error("Error storing refresh token in DB:", error);
      return c.json({ message: "An error occurred during login" }, 500);
    }

    return c.json({ message: "login successful" });
  },
);
