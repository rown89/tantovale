import { Hono } from "hono";
import { env } from "hono/adapter";
import { verify } from "hono/jwt";

type Bindings = {
  RESET_TOKEN_SECRET: string;
};

export const passwordResetVerifyToken = new Hono<{ Bindings: Bindings }>()
  // Verify Reset Token
  .get("/reset-verify-token", async (c) => {
    const { RESET_TOKEN_SECRET } = env<Bindings>(c);
    const token = c.req.query("token");

    if (!token) return c.json({ error: "Token required" }, 400);

    try {
      const payload = await verify(token, RESET_TOKEN_SECRET);
      return c.json({ valid: true, id: payload.id });
    } catch (error) {
      return c.json({ error: "Invalid or expired token" }, 400);
    }
  });
