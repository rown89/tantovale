import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import UserSchema from "../users/schema";
import { db } from "@tantovale/database/db";
import { users } from "@tantovale/database/schema";

import "dotenv/config";

export const signupRoute = new Hono().post(
  "/",
  zValidator("json", UserSchema),
  async (c) => {
    try {
      const { firstName, lastName, email, password } = await c.req.json();

      const results = await db
        .insert(users)
        .values({ firstName, lastName, email, password })
        .returning();

      if (!results) {
        throw new HTTPException(500, {
          message: "Signup procedure went wrong, no results",
        });
      }

      return c.json({
        message: "Successful Signup",
      });
    } catch (error) {
      console.error("Catch error:", error);

      throw new HTTPException(500, { message: "Signup procedure went wrong" });
    }
  },
);
