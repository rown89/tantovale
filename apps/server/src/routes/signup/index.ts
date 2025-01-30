import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { UserSchema } from "../users/schema";
import { db } from "@tantovale/database/db";
import { users } from "@tantovale/database/schema";

import "dotenv/config";
import { deleteCookie, checkEmail } from "../../lib/utils";
import { env } from "hono/adapter";
import { generateAndSetTokens } from "../../lib/generateTokens";
import { hashPassword } from "../../lib/password";

export const signupRoute = new Hono().post(
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

    try {
      const values = await c.req.json();
      const { email, password } = values;

      const emailAlreadyExist = await checkEmail(email);

      // Check if email already exists
      if (emailAlreadyExist) {
        return c.json({ message: "Email already exists" }, 409);
      }

      const hashedPassword = await hashPassword(password);

      // Create new user
      const results = await db
        .insert(users)
        .values({ ...values, password: hashedPassword })
        .returning();

      if (!results || results.length === 0) {
        throw new HTTPException(400, {
          message: "Signup procedure can't add user",
        });
      }

      const { token, refreshToken, accessTokenPayload, refreshTokenPayload } =
        await generateAndSetTokens({
          c,
          id: results?.[0]?.id!,
          email,
          token_secret: ACCESS_TOKEN_SECRET,
          refresh_token_secret: REFRESH_TOKEN_SECRET,
          cookie_secret: COOKIE_SECRET,
          hostname: SERVER_HOSTNAME,
        });

      return c.json({
        message: "Successful Signup",
        token,
        accessTokenPayload,
      });
    } catch (error) {
      console.log(error);
      // Clear any existing token on error
      deleteCookie(c, "token");

      return c.json(
        {
          message: "Internal server error",
          error,
        },
        500,
      );
    }
  },
);
