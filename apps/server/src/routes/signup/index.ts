import { Hono } from "hono";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { env } from "hono/adapter";
import { deleteCookie, checkEmail } from "../../lib/utils";
import { hashPassword } from "../../lib/password";
import { db } from "@workspace/database/db";
import { UserSchema } from "../users/schema";
import { users } from "@workspace/database/schema";
import { sendVerifyEmail } from "@workspace/mailer/templates/verify-email";

import "dotenv/config";

type Bindings = {
  ACCESS_TOKEN_SECRET: string;
  SERVER_HOSTNAME: string;
  SERVER_VERSION: string;
};

export const signupRoute = new Hono<{ Bindings: Bindings }>().post(
  "/",
  zValidator("json", UserSchema),
  async (c) => {
    const { ACCESS_TOKEN_SECRET, SERVER_HOSTNAME, SERVER_VERSION } = env<{
      ACCESS_TOKEN_SECRET: string;
      SERVER_HOSTNAME: string;
      SERVER_VERSION: string;
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

      if (!results || !results.length) {
        return c.json(
          {
            message: "Signup procedure can't create user",
          },
          500,
        );
      }

      // Generate JWT token for email verification
      const tmp_token_payload = {
        id: Number(results?.[0]?.id),
        email,
        type: "email_verification",
        expiresIn: new Date(Date.now() + 60 * 60 * 1000), // 60min
      };

      const token = await sign(tmp_token_payload, ACCESS_TOKEN_SECRET);

      // Send verification email
      const verificationLink = `https://${SERVER_HOSTNAME}/${SERVER_VERSION}/verify/email?token=${token}`;

      if (process.env.NODE_ENV === "development") {
        console.log("verificationLink: ", verificationLink);
      }

      await sendVerifyEmail(email, verificationLink);

      return c.json({
        message: "Successful Signup",
      });
    } catch (error) {
      console.error(error);

      deleteCookie(c, "token"); // Clear any existing token on error

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
