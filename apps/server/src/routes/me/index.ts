import { Hono } from "hono";
import { getSignedCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { env } from "hono/adapter";

type Bindings = {
  ACCESS_TOKEN_SECRET: string;
  COOKIE_SECRET: string;
};

export const meRoute = new Hono<{ Bindings: Bindings }>().get(
  "/",
  async (c) => {
    const { ACCESS_TOKEN_SECRET, COOKIE_SECRET } = env(c);
    // Get the signed access token from cookies
    const accessToken = await getSignedCookie(c, COOKIE_SECRET, "access_token");

    if (!accessToken) {
      return c.json({ message: "No token provided" }, 401);
    }

    try {
      // Verify and decode the token
      const payload = await verify(accessToken, ACCESS_TOKEN_SECRET);

      if (!payload) {
        return c.json({ message: "Invalid token" }, 401);
      }

      return c.json(
        {
          user: {
            id: payload.id,
            username: payload.username,
            exp: payload.exp,
          },
        },
        200,
      );
    } catch (err) {
      console.error("Token verification error:", err);
      return c.json({ message: "Invalid or expired token" }, 401);
    }
  },
);
