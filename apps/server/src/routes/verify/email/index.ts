import { Hono } from "hono";
import { env } from "hono/adapter";
import { verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { setAuthTokens } from "@/lib/tokenPayload";
import { DEFAULT_REFRESH_TOKEN_EXPIRES } from "@/utils/constants";
import { createDb } from "database";
import { refreshTokens, users } from "@/database/schema";

import type { AppBindings } from "@/lib/types";

export const verifyEmailRoute = new Hono<AppBindings>().get(
  "/email",
  describeRoute({
    description: "Email verifier",
    responses: {
      200: {
        description: "Email verified successfully!",
      },
    },
  }),
  async (c) => {
    const { EMAIL_VERIFY_TOKEN_SECRET } = env<{
      EMAIL_VERIFY_TOKEN_SECRET: string;
    }>(c);

    const token = c.req.query("token");
    if (!token) return c.json({ error: "Token required" }, 409);

    const { id, type } = await verify(token, EMAIL_VERIFY_TOKEN_SECRET);

    const { db } = createDb(c.env);
    // Get existing user by id
    const user = await db.query.users.findFirst({
      where: (tbl) => eq(tbl.id, Number(id)),
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    if (user.email_verified) {
      return c.json({ message: "User already verified" });
    }
    if (type != "email_verification") {
      return c.json({ message: "Invalid token type" });
    }

    await db
      .update(users)
      .set({
        email_verified: true,
      })
      .where(eq(users.id, user.id));

    const authTokensPayload = {
      c,
      id: user.id,
      username: user.username,
      email_verified: user.email_verified,
      phone_verified: user.phone_verified,
    };

    const { refresh_token } = await setAuthTokens(authTokensPayload);

    // Store refresh token in DB
    const updatedUser = await db
      .insert(refreshTokens)
      .values({
        username: user.username,
        token: refresh_token,
        expires_at: DEFAULT_REFRESH_TOKEN_EXPIRES,
      })
      .returning();

    if (!updatedUser || !updatedUser.length) {
      return c.json(
        {
          message:
            "An error occurred, can't update the refresh token during login",
        },
        500,
      );
    }

    return c.json(
      {
        message: "Email verified successfully!",
      },
      200,
    );
  },
);
