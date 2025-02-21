import { Hono } from "hono";
import { getCookie, getSignedCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { env } from "hono/adapter";
import type { AppBindings } from "@/lib/types";

export const meRoute = new Hono<AppBindings>().get("/", async (c) => {
  const { ACCESS_TOKEN_SECRET, COOKIE_SECRET } = env<{
    ACCESS_TOKEN_SECRET: string;
    COOKIE_SECRET: string;
  }>(c);
  // TODO: signed cookie doesn't work yet
  // Get the signed access token from cookies
  const accessToken = getCookie(c, "access_token");
  // const accessToken = await getSignedCookie(c, COOKIE_SECRET, "access_token");
  console.log(accessToken);
  if (!accessToken) return c.json({ message: "No token provided" }, 401);

  try {
    // Verify and decode the token
    const payload = await verify(accessToken, ACCESS_TOKEN_SECRET);

    if (!payload) return c.json({ message: "Invalid token" }, 401);

    return c.json(
      {
        user: {
          id: payload.id,
          username: payload.username,
          email_verified: payload.email_verified,
          phone_verified: payload.phone_verified,
          exp: payload.exp,
        },
      },
      200,
    );
  } catch (err) {
    console.error("Token verification error:", err);
    return c.json({ message: "Invalid or expired token" }, 401);
  }
});
