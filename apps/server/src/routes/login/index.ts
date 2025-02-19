import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { env } from "hono/adapter";
import { UserSchema } from "@/schema/users";
import { setAuthTokens } from "@/lib/tokenPayload";
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

    const { id, username } = user;

    const authTokensPayload = {
      c,
      id,
      username,
    };

    const { access_token, refresh_token } =
      await setAuthTokens(authTokensPayload);

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

    return c.json({
      message: "login successful",
      cookies: {
        access_token,
        refresh_token,
      },
    });
  },
);
