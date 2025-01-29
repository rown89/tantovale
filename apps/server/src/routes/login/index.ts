import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { deleteCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import { env } from "hono/adapter";
import {
  checkPassword,
  emailExist,
  generateAndSetToken,
} from "../../lib/utils";
import { UserSchema } from "../users/schema";

export const loginRoute = new Hono().post(
  "/",
  zValidator("json", UserSchema.omit({ firstName: true, lastName: true })),
  async (c) => {
    const { SERVER_SECRET } = env<{ SERVER_SECRET: string }>(c);

    try {
      const { email, password } = await c.req.json();

      // Validate email exists and is registered
      const user = await emailExist(email);
      if (!user) {
        return c.json({ error: "Invalid credentials" }, 401);
      }

      // Validate password
      const isValidPassword = await checkPassword(password, user.password);
      if (!isValidPassword) {
        return c.json({ error: "Invalid credentials" }, 401);
      }

      const { token, payload } = await generateAndSetToken(
        c,
        email,
        SERVER_SECRET,
      );

      return c.json({
        message: "Login successful",
        payload,
        token,
      });
    } catch (error) {
      console.error("Login error:", error);

      // Clear any existing token on error
      deleteCookie(c, "token");

      throw new HTTPException(500, { message: "Invalid credentials" });
    }
  },
);
