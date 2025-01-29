import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { UserSchema } from "../users/schema";
import { db } from "@tantovale/database/db";
import { users } from "@tantovale/database/schema";

import "dotenv/config";
import {
  deleteCookie,
  emailExist,
  errorWithStatus,
  generateAndSetToken,
  hashPassword,
} from "../../lib/utils";
import { env } from "hono/adapter";

export const signupRoute = new Hono().post(
  "/",
  zValidator("json", UserSchema),
  async (c) => {
    const { SERVER_SECRET } = env<{ SERVER_SECRET: string }>(c);

    try {
      const values = await c.req.json();
      const { email, password } = values;

      // Check if email already exists
      if (await emailExist(email)) {
        throw new HTTPException(409, {
          message: "Email already exists",
        });
      }

      // Create new user
      const results = await db
        .insert(users)
        .values({ ...values, password: await hashPassword(password) })
        .returning();

      if (!results || results.length === 0) {
        throw new HTTPException(400, {
          message: "Signup procedure can't add user",
        });
      }

      const { token, payload } = await generateAndSetToken(
        c,
        email,
        SERVER_SECRET,
      );

      return c.json({
        message: "Successful Signup",
        token,
        payload,
      });
    } catch (error) {
      // Clear any existing token on error
      deleteCookie(c, "token");

      if (errorWithStatus(error, 409)) {
        return c.json({ message: "Email already exists", error }, 409);
      }

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
