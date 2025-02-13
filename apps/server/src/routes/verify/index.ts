import { Hono } from "hono";
import { env } from "hono/adapter";
import { getSignedCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { zValidator } from "@hono/zod-validator";
import { EmailVerifySchema } from "@/schema";
import { setAuthTokens } from "@/lib/generateTokens";
import { isDevelopmentMode } from "@/lib/constants";
import { db } from "@workspace/database/db";
import { refreshTokens, users } from "@workspace/database/schema";

type Bindings = {
  ACCESS_TOKEN_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  COOKIE_SECRET: string;
  SERVER_HOSTNAME: string;
};

export const verifyRoute = new Hono<{ Bindings: Bindings }>()
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
      const {
        ACCESS_TOKEN_SECRET,
        REFRESH_TOKEN_SECRET,
        COOKIE_SECRET,
        SERVER_HOSTNAME,
      } = env<{
        ACCESS_TOKEN_SECRET: string;
        REFRESH_TOKEN_SECRET: string;
        COOKIE_SECRET: string;
        SERVER_HOSTNAME: string;
      }>(c);

      try {
        // Get tokens individually
        const auth_token = await getSignedCookie(
          c,
          COOKIE_SECRET,
          "auth_token",
        );
        const refresh_token = await getSignedCookie(
          c,
          COOKIE_SECRET,
          "refresh_token",
        );

        if (isDevelopmentMode) {
          console.log("Verify endpoint received tokens:", {
            auth_token: auth_token ? "present" : "missing",
            refresh_token: refresh_token ? "present" : "missing",
          });
        }

        if (!auth_token || !refresh_token) {
          return c.json(
            {
              valid: false,
              message: "No token provided",
            },
            401,
          );
        }

        try {
          const payload = await verify(auth_token, ACCESS_TOKEN_SECRET);
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
      const {
        ACCESS_TOKEN_SECRET,
        REFRESH_TOKEN_SECRET,
        COOKIE_SECRET,
        SERVER_HOSTNAME,
      } = env<{
        ACCESS_TOKEN_SECRET: string;
        REFRESH_TOKEN_SECRET: string;
        COOKIE_SECRET: string;
        SERVER_HOSTNAME: string;
      }>(c);

      const token = c.req.query("token");
      if (!token) return c.json({ error: "Token required" }, 409);

      const { id, type } = await verify(token, ACCESS_TOKEN_SECRET);

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
        .where(eq(users.id, Number(id)));

      const { access_token, refresh_token } = await setAuthTokens({
        c,
        id: user.id,
        username: user.username,
        access_token_secret: ACCESS_TOKEN_SECRET,
        refresh_token_secret: REFRESH_TOKEN_SECRET,
        cookie_secret: COOKIE_SECRET,
        domain: SERVER_HOSTNAME,
      });

      // Store refresh token in DB
      const updatedUser = await db
        .insert(refreshTokens)
        .values({
          username: user.username,
          token: refresh_token,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1y
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

      return c.json({
        message: "Email verified successfully!",
        access_token,
        refresh_token,
      });
    },
  );
