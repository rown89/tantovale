import type { AppBindings } from "#lib/types";
import { Hono } from "hono";
import { verify } from "hono/jwt";

export const passwordResetVerifyToken = new Hono<AppBindings>()
  // Verify Reset Token
  .get("/reset-verify-token", async (c) => {
    const { RESET_TOKEN_SECRET } = c.env;

    const token = c.req.query("token");

    if (!token) return c.json({ error: "Token required" }, 400);

    try {
      const payload = await verify(token, RESET_TOKEN_SECRET);
      return c.json({ valid: true, id: payload.id });
    } catch (error) {
      return c.json({ error: "Invalid or expired token" }, 400);
    }
  });
