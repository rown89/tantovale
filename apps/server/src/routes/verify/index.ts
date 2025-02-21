import { Hono } from "hono";
import { env } from "hono/adapter";
import { getCookie, getSignedCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { zValidator } from "@hono/zod-validator";
import { EmailVerifySchema } from "@/schema";
import { setAuthTokens } from "@/lib/tokenPayload";
import {
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  isDevelopmentMode,
} from "@/lib/constants";
import { createDb } from "database";
import { refreshTokens, users } from "database/schema/schema";
import type { AppBindings } from "@/lib/types";

export const verifyRoute = new Hono<AppBindings>()
  .post(
    "/",
    zValidator("json", EmailVerifySchema),
    describeRoute({
      description: "Token verifier",
      responses: {
        200: {
          description: "Tokens verified successfully",
          content: {
            "application/json": {
              schema: resolver(EmailVerifySchema),
            },
          },
        },
        401: {
          description: "Invalid token or No token provided",
        },
        500: {
          description: "Error processing request",
        },
      },
    }),
    async (c) => {
      const { ACCESS_TOKEN_SECRET, COOKIE_SECRET } = env<{
        ACCESS_TOKEN_SECRET: string;
        COOKIE_SECRET: string;
      }>(c);

      try {
        // Get tokens individually
        const access_token = getCookie(c, "access_token");
        const refresh_token = getCookie(c, "refresh_token");
        /*  
        const access_token = await getSignedCookie(
          c,
          COOKIE_SECRET,
          "access_token",
        );
        const refresh_token = await getSignedCookie(
          c,
          COOKIE_SECRET,
          "refresh_token",
        );
        */

        if (isDevelopmentMode) {
          console.log("Verify endpoint received tokens:", {
            access_token: access_token ? "present" : "missing",
            refresh_token: refresh_token ? "present" : "missing",
          });
        }

        if (!access_token || !refresh_token) {
          return c.json(
            {
              valid: false,
              message: "No token provided",
            },
            401,
          );
        }

        try {
          const payload = await verify(access_token, ACCESS_TOKEN_SECRET);
          console.log("Token verified successfully for user:", payload.email);

          return c.json(
            {
              email: payload.email,
            },
            200,
          );
        } catch (error) {
          console.error("Token verification failed:", error);
          return c.json(
            {
              message: "Invalid token",
            },
            401,
          );
        }
      } catch (error) {
        console.error("Error in verify endpoint:", error);
        return c.json(
          {
            message: "Error processing request",
          },
          500,
        );
      }
    },
  )
  .get(
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
