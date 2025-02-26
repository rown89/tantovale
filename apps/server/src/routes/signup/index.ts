import "dotenv/config";

import { Hono } from "hono";
import { sign } from "hono/jwt";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi/zod";
import { checkUser } from "#lib/utils";
import { hashPassword } from "#lib/password";
import { UserSchema } from "#schema";
import { getNodeEnvMode } from "#utils/constants";
import { createWranglerDb } from "#database/db";
import { users } from "#database/schema";
import { sendVerifyEmail } from "#mailer/templates/verify-email";
import { deleteCookie } from "hono/cookie";
import type { AppBindings } from "#lib/types";

export const signupRoute = new Hono<AppBindings>().post(
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
    const { EMAIL_VERIFY_TOKEN_SECRET, STOREFRONT_HOSTNAME, STOREFRONT_PORT } =
      c.env;

    try {
      const values = await c.req.json();
      const { username, email, password } = values;

      const userAlreadyExist = await checkUser(c, username, "username");
      const emailAlreadyExist = await checkUser(c, email, "email");

      if (userAlreadyExist) {
        return c.json({ message: "Username already exists" }, 422);
      }
      if (emailAlreadyExist) {
        return c.json({ message: "Email already exists" }, 409);
      }

      const hashedPassword = await hashPassword(password);

      const { db } = createWranglerDb(c.env);
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

      const token = await sign(tmp_token_payload, EMAIL_VERIFY_TOKEN_SECRET);

      const { isProductionMode, isStagingMode } = getNodeEnvMode(
        c.env.NODE_ENV,
      );
      const verificationLink = `http${isProductionMode || isStagingMode ? "s" : ""}://${c.env.STOREFRONT_HOSTNAME}:${c.env.STOREFRONT_PORT}/api/verify/email?token=${token}`;

      if (isProductionMode || isStagingMode) {
        await sendVerifyEmail(email, verificationLink);
      } else {
        console.log("\nverificationLink: ", verificationLink, "\n");
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
