import { Hono } from "hono";
import { verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { hashPassword } from "#lib/password";
import { createWranglerDb } from "#database/db";
import { users, passwordResetTokens } from "#database/schema";
import type { AppBindings } from "#lib/types";

export const passwordResetRoute = new Hono<AppBindings>()
  // Update Password
  .post("/reset", async (c) => {
    const { RESET_TOKEN_SECRET } = c.env;

    const { token, newPassword } = await c.req.json();

    if (!token || !newPassword) {
      return c.json({ error: "Token and new password required" }, 400);
    }

    try {
      const payload = await verify(token, RESET_TOKEN_SECRET);

      const { db } = createWranglerDb(c.env);
      // Check if token exists in DB
      const storedToken = await db.query.passwordResetTokens.findFirst({
        where: (tbl) => eq(tbl.token, token),
      });

      if (!storedToken) {
        return c.json({ error: "Invalid or expired token" }, 400);
      }

      const hashedPassword = await hashPassword(newPassword);

      // Update user password
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, Number(payload.id)));

      // Delete reset token from DB
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token));

      return c.json({ message: "Password updated successfully!" });
    } catch (error) {
      return c.json({ error: "Invalid or expired token" }, 400);
    }
  });
