import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { getSignedCookie } from "hono/cookie";

export async function authMiddleware(c: Context, next: Next) {
  try {
    const cookie_secret = c.env.COOKIE_SECRET!;
    const access_token_secret = c.env.ACCESS_TOKEN_SECRET!;

    // const rawToken = getCookie(c, "access_token");
    // console.log("\nRaw token:", rawToken);

    const access_token = await getSignedCookie(
      c,
      cookie_secret,
      "access_token",
    );

    console.log("\nSigned access_token :", access_token, "\n");

    if (!access_token) {
      return c.json({ message: "Unauthorized - No Token" }, 401);
    }

    const payload = await verify(access_token, access_token_secret);

    console.log("Token payload:", payload, "\n");

    // Set user in context
    c.set("user", payload);

    await next();
  } catch (error) {
    console.error("Auth Middleware Error:\n", error, "\n");
    return c.json({ message: "Invalid token" }, 401);
  }
}
