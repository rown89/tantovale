import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { tokenPayload } from "#lib/tokenPayload";
import { verifyPassword } from "#lib/password";
import { createClient } from "@workspace/database/db";
import {
  users,
  refreshTokens,
  selectUsersSchema,
} from "@workspace/database/schemas/schema";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES,
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
  getNodeEnvMode,
} from "#utils/constants";
import { sign } from "hono/jwt";
import { getAuthTokenOptions } from "#lib/getAuthTokenOptions";
import { env } from "hono/adapter";
import { UserSchema } from "#schema/users";
import { createRouter } from "#lib/create-app";
import { setCookie } from "hono/cookie";

export const loginRoute = createRouter().post(
  "/",
  zValidator(
    "json",
    UserSchema.pick({
      email: true,
      password: true,
    }),
  ),
  async (c) => {
    const { NODE_ENV, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = env<{
      NODE_ENV: string;
      ACCESS_TOKEN_SECRET: string;
      REFRESH_TOKEN_SECRET: string;
    }>(c);

    const { isProductionMode } = getNodeEnvMode(NODE_ENV);

    try {
      const { email, password } = await c.req.json();

      const { db } = createClient();
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
        console.log(verifyResult);
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
        exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS(),
      });

      const refresh_token_payload = tokenPayload({
        id,
        username,
        email_verified,
        phone_verified,
        exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS(),
      });

      // Generate and sign tokens
      const access_token = await sign(
        access_token_payload,
        ACCESS_TOKEN_SECRET,
      );
      const refresh_token = await sign(
        refresh_token_payload,
        REFRESH_TOKEN_SECRET,
      );

      setCookie(c, "access_token", access_token, {
        ...getAuthTokenOptions({
          isProductionMode,
          expires: DEFAULT_ACCESS_TOKEN_EXPIRES(),
        }),
      });

      setCookie(c, "refresh_token", refresh_token, {
        ...getAuthTokenOptions({
          isProductionMode,
          expires: DEFAULT_REFRESH_TOKEN_EXPIRES(),
        }),
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
    } catch (error) {
      console.error("Login error: ", error);
      return c.json({ message: "Internal server error" }, 500);
    }
  },
);
