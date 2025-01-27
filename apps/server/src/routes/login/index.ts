import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import UserSchema from "../user/schema";
import { env } from "hono/adapter";

export const loginRoute = new Hono().post(
  "/",
  zValidator("json", UserSchema.omit({ firstName: true, lastName: true })),
  async (c) => {
    const { SERVER_SECRET } = env<{ SERVER_SECRET: string }>(c);

    try {
      const { email } = await c.req.json();

      // // Validate email exists and is registered
      // const user = await findUserByEmail(email);
      // if (!user) {
      //   return c.json({ error: "User not found" }, 404);
      // }

      // // Verify password (implement your authentication logic)
      // const isValidPassword = await verifyPassword(
      //   email,
      //   c.req.json().password,
      // );
      // if (!isValidPassword) {
      //   return c.json({ error: "Invalid credentials" }, 401);
      // }

      const payload = {
        email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      };

      const token = await sign(payload, SERVER_SECRET || "");

      // HTTP-only, secure cookie
      setCookie(c, "token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 24 hours
      });

      console.log(process.env.SERVER_SECRET);

      return c.json({
        message: "Login successful",
        payload,
        token,
      });
    } catch (error) {
      console.error("Login error:", error);

      // Clear any existing token on error
      // deleteCookie(c, "token");

      throw new HTTPException(500, { message: "Invalid credentials" });
    }
  },
);
