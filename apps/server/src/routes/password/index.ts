import { Hono } from "hono";
import { env } from "hono/adapter";
import { verify, sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { isDevelopmentMode } from "@/lib/constants";
import { sendForgotPasswordEmail } from "@workspace/mailer/forgot-password-email";
import { db } from "@workspace/database/db";
import { users, passwordResetTokens } from "@workspace/database/schema";

type Bindings = {
  ACCESS_TOKEN_SECRET: string;
  SERVER_HOSTNAME: string;
  SERVER_VERSION: string;
  RESET_TOKEN_SECRET: string;
};

export const passwordRoute = new Hono<{ Bindings: Bindings }>()
  .post("/forgot-password", async (c) => {
    const { SERVER_HOSTNAME, SERVER_VERSION, RESET_TOKEN_SECRET } =
      env<Bindings>(c);
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    // Check if the user exists
    const user = await db.query.users.findFirst({
      where: (tbl) => eq(tbl.email, email),
    });

    if (!user) {
      return c.json({ message: "If the email exists, a reset link was sent." });
    }

    // Generate a reset token
    const resetToken = await sign({ id: user.id, email }, RESET_TOKEN_SECRET);

    // Store token in DB (optional but safer)
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: resetToken,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    });

    const resetLink = `${SERVER_HOSTNAME}/${SERVER_VERSION}/password/reset-password?token=${resetToken}`;

    if (isDevelopmentMode) console.log("resetLink: ", resetLink);

    await sendForgotPasswordEmail(email, resetLink);

    return c.json({ message: "If the email exists, a reset link was sent." });
  })
  // Verify Reset Token
  .get("/reset-password", async (c) => {
    const { RESET_TOKEN_SECRET } = env<Bindings>(c);
    const token = c.req.query("token");

    if (!token) return c.json({ error: "Token required" }, 400);

    try {
      const payload = await verify(token, RESET_TOKEN_SECRET);
      return c.json({ valid: true, id: payload.id });
    } catch (error) {
      return c.json({ error: "Invalid or expired token" }, 400);
    }
  })

  // Update Password
  .post("/reset-password", async (c) => {
    const { RESET_TOKEN_SECRET } = env<Bindings>(c);
    const { token, newPassword } = await c.req.json();

    if (!token || !newPassword) {
      return c.json({ error: "Token and new password required" }, 400);
    }

    try {
      const payload = await verify(token, RESET_TOKEN_SECRET);

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
