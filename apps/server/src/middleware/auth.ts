import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { getSignedCookie } from "hono/cookie";

export async function authMiddleware(c: Context, next: Next) {
  try {
    const access_token = await getSignedCookie(
      c,
      process.env.COOKIE_SECRET!,
      "access_token",
    );

    if (!access_token) return c.json({ message: "Unauthorized" }, 401);

    const payload = await verify(
      access_token,
      process.env.ACCESS_TOKEN_SECRET!,
    );

    c.set("user", payload);
    await next();
  } catch (error) {
    return c.json({ message: "Invalid token" }, 401);
  }
}
