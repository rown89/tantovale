import "dotenv/config";

import { Hono } from "hono";
import { sign } from "hono/jwt";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi/zod";
import { env } from "hono/adapter";
import { deleteCookie, checkUser } from "@/lib/utils";
import { hashPassword } from "@/lib/password";
import { UserSchema } from "@/schema";
import { isDevelopmentMode, isProductionMode } from "@/lib/constants";
import { db } from "@workspace/database/db";
import { users } from "@workspace/database/schema";
import { sendVerifyEmail } from "@workspace/mailer/verify-email";

type Bindings = {
  NEXT_PUBLIC_STOREFRONT_URL: string;
  NEXT_PUBLIC_STOREFRONT_PORT: string;
  ACCESS_TOKEN_SECRET: string;
  SERVER_HOSTNAME: string;
  SERVER_VERSION: string;
};

export const signupRoute = new Hono<{ Bindings: Bindings }>().post(
  "/",
  describeRoute({
    description: "Create a user",
    responses: {
      200: {
        description: "Successful Signup",
      },
    },
  }),
  zValidator("json", UserSchema),
  async (c) => {
    const {
      ACCESS_TOKEN_SECRET,
      SERVER_HOSTNAME,
      SERVER_VERSION,
      NEXT_PUBLIC_STOREFRONT_URL,
      NEXT_PUBLIC_STOREFRONT_PORT,
    } = env<{
      ACCESS_TOKEN_SECRET: string;
      SERVER_HOSTNAME: string;
      SERVER_VERSION: string;
      NEXT_PUBLIC_STOREFRONT_URL: string;
      NEXT_PUBLIC_STOREFRONT_PORT: string;
    }>(c);

    try {
      const values = await c.req.json();
      const { username, email, password } = values;

      const userAlreadyExist = await checkUser(username, "username");
      const emailAlreadyExist = await checkUser(email, "email");

      if (userAlreadyExist) {
        return c.json({ message: "Username already exists" }, 422);
      }
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
        username: results?.[0]?.username,
        type: "email_verification",
        expiresIn: new Date(Date.now() + 60 * 60 * 1000), // 60min
      };

      const token = await sign(tmp_token_payload, ACCESS_TOKEN_SECRET);

      // Send verification email
      const verificationLink = `http${isDevelopmentMode ? "" : "s"}://${NEXT_PUBLIC_STOREFRONT_URL}:${NEXT_PUBLIC_STOREFRONT_PORT}/api/verify/email?token=${token}`;

      if (isDevelopmentMode) {
        console.log("verificationLink: ", verificationLink);
      }

      if (!isDevelopmentMode) {
        await sendVerifyEmail(email, verificationLink);
      }

      return c.json(
        {
          message: "Successful Signup",
        },
        201,
      );
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
