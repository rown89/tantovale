import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { getCookie, getSignedCookie } from "hono/cookie";
import { env } from "hono/adapter";

export async function authMiddleware(c: Context, next: Next) {
  const { ACCESS_TOKEN_SECRET, COOKIE_SECRET } = env<{
    ACCESS_TOKEN_SECRET: string;
    COOKIE_SECRET: string;
  }>(c);

  try {
    // TODO: signed cookie doesn't work yet
    /* const access_token = await getSignedCookie(
      c,
      COOKIE_SECRET,
      "access_token",
    ); */

    const access_token = getCookie(c, "access_token");

    console.log("\nAuth Middleware, access_token :", access_token, "\n");

    if (!access_token) {
      return c.json({ message: "Unauthorized - No Token" }, 401);
    }

    const payload = await verify(access_token, ACCESS_TOKEN_SECRET);

    // Set user in context
    c.set("user", payload);

    await next();
  } catch (error) {
    console.error("Auth Middleware Error:\n", error, "\n");
    return c.json({ message: "Invalid token" }, 401);
  }
}
