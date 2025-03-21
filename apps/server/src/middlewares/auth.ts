import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { getCookie } from "hono/cookie";
import { env } from "hono/adapter";

import type { AppBindings } from "#lib/types";

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
  const { ACCESS_TOKEN_SECRET } = env<{
    ACCESS_TOKEN_SECRET: string;
  }>(c);

  try {
    const access_token = getCookie(c, "access_token");

    if (!access_token) {
      return c.json({ message: "Unauthorized - No Token" }, 401);
    }

    const payload = await verify(access_token, ACCESS_TOKEN_SECRET);

    // Set user in context
    const user = {
      id: Number(payload.id),
      username: String(payload.username),
      email_verified:
        payload.email_verified === "true" || payload.email_verified === true,
      phone_verified:
        payload.phone_verified === "true" || payload.phone_verified === true,
    };

    c.set("user", user);

    await next();
  } catch (error) {
    console.error("Auth Middleware Error:\n", error, "\n");

    return c.json({ message: "Invalid token" }, 401);
  }
}
