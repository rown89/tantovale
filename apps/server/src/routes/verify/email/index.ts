import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { tokenPayload } from "#lib/tokenPayload";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES,
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
} from "#utils/constants";
import { createDb } from "#database/db";
import { refreshTokens, users } from "#database/schema";

import type { AppBindings } from "#lib/types";
import { setCookie } from "hono/cookie";
import { getAuthTokenOptions } from "#lib/getAuthTokenOptions";

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
    const { EMAIL_VERIFY_TOKEN_SECRET } = c.env;

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

    const { id: userId, username, email_verified, phone_verified } = user;

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

    const access_token_payload = tokenPayload({
      id: userId,
      username,
      email_verified,
      phone_verified,
      exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS(),
    });

    const refresh_token_payload = tokenPayload({
      id: userId,
      username,
      email_verified,
      phone_verified,
      exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS(),
    });

    // Generate and sign tokens
    const new_access_token = await sign(
      access_token_payload,
      c.env.ACCESS_TOKEN_SECRET,
    );
    const new_refresh_token = await sign(
      refresh_token_payload,
      c.env.REFRESH_TOKEN_SECRET,
    );

    setCookie(c, "access_token", new_access_token, {
      ...getAuthTokenOptions({
        expires: DEFAULT_ACCESS_TOKEN_EXPIRES(),
      }),
    });
    setCookie(c, "refresh_token", new_refresh_token, {
      ...getAuthTokenOptions({
        expires: DEFAULT_REFRESH_TOKEN_EXPIRES(),
      }),
    });

    // Store refresh token in DB
    const updatedUser = await db
      .insert(refreshTokens)
      .values({
        username,
        token: new_refresh_token,
        expires_at: DEFAULT_REFRESH_TOKEN_EXPIRES(),
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
