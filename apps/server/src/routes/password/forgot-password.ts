import { Hono } from "hono";
import { env } from "hono/adapter";
import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { isDevelopmentMode } from "@/utils/constants";
import { sendForgotPasswordEmail } from "@/mailer/templates/forgot-password-email";
import { createDb } from "database";
import { passwordResetTokens } from "database/schema/schema";
import type { AppBindings } from "@/lib/types";

export const passwordForgotRoute = new Hono<AppBindings>().post(
  "/forgot-password",
  async (c) => {
    const { SERVER_HOSTNAME, RESET_TOKEN_SECRET } = env(c);
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const { db } = createDb(c.env);
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
      expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    });

    const resetLink = `${SERVER_HOSTNAME}/password/reset-password?token=${resetToken}`;

    if (isDevelopmentMode) console.log("resetLink: ", resetLink);

    await sendForgotPasswordEmail(email, resetLink);

    return c.json({ message: "If the email exists, a reset link was sent." });
  },
);
