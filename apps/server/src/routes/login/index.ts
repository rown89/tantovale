import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { env } from "hono/adapter";
import { UserSchema } from "@/schema/users";
import { generateAndSetTokens } from "@/lib/generateTokens";
import { verifyPassword } from "@/lib/password";
import { db } from "@workspace/database/db";
import { users, refreshTokens } from "@workspace/database/schema";

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

    const { refreshToken } = await generateAndSetTokens({
      c,
      id: userFromDb?.[0]?.id!,
      username: userFromDb?.[0]?.username!,
      token_secret: ACCESS_TOKEN_SECRET,
      refresh_token_secret: REFRESH_TOKEN_SECRET,
      cookie_secret: COOKIE_SECRET,
      hostname: SERVER_HOSTNAME,
    });

    // Store refresh token in DB
    const newRefreshToken = await db
      .insert(refreshTokens)
      .values({
        username: userFromDb?.[0]?.username!,
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
