import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { env } from "hono/adapter";
import { UserSchema } from "@/schema/users";
import { setAuthTokens } from "@/lib/generateTokens";
import { verifyPassword } from "@/lib/password";
import { db } from "@workspace/database/db";
import { users, refreshTokens } from "@workspace/database/schema";

type Bindings = {
  Bindings: {
    ACCESS_TOKEN_SECRET: string;
    REFRESH_TOKEN_SECRET: string;
    COOKIE_SECRET: string;
  };
};

export const loginRoute = new Hono<Bindings>().post(
  "/",
  zValidator("json", UserSchema.omit({ username: true })),
  async (c) => {
    const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, COOKIE_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
      REFRESH_TOKEN_SECRET: string;
      COOKIE_SECRET: string;
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
      return c.json({ message: "invalid email or password" }, 500);
    }

    // handle invalid password
    const verifyResult = await verifyPassword(
      userFromDb?.[0]?.password,
      password,
    );

    if (!verifyResult) {
      return c.json({ message: "invalid email or password" }, 500);
    }
    const { access_token, refresh_token } = await setAuthTokens({
      c,
      id: userFromDb?.[0]?.id!,
      username: userFromDb?.[0]?.username!,
      access_token_secret: ACCESS_TOKEN_SECRET,
      refresh_token_secret: REFRESH_TOKEN_SECRET,
      cookie_secret: COOKIE_SECRET,
    });

    // Store refresh token in DB
    const newRefreshToken = await db
      .insert(refreshTokens)
      .values({
        username: userFromDb?.[0]?.username!,
        token: refresh_token,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
      .returning();

    if (!newRefreshToken || !newRefreshToken.length) {
      console.error("Error storing refresh token in DB:", refresh_token);
      return c.json({ message: "An error occurred during login" }, 500);
    }

    return c.json({
      message: "login successful",
      cookies: {
        access_token,
        refresh_token,
      },
    });
  },
);
