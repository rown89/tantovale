import { Hono } from "hono";
import { env } from "hono/adapter";
import { sign } from "hono/jwt";
import { eq } from "drizzle-orm";
import { isDevelopmentMode } from "@/lib/constants";
import { sendForgotPasswordEmail } from "@workspace/mailer/forgot-password-email";
import { db } from "@workspace/database/db";
import { passwordResetTokens } from "@workspace/database/schema";

type Bindings = {
  SERVER_HOSTNAME: string;
  SERVER_VERSION: string;
  RESET_TOKEN_SECRET: string;
};

export const passwordForgotRoute = new Hono<{ Bindings: Bindings }>().post(
  "/forgot-password",
  async (c) => {
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
      expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    });

    const resetLink = `${SERVER_HOSTNAME}/${SERVER_VERSION}/password/reset-password?token=${resetToken}`;

    if (isDevelopmentMode) console.log("resetLink: ", resetLink);

    await sendForgotPasswordEmail(email, resetLink);

    return c.json({ message: "If the email exists, a reset link was sent." });
  },
);
