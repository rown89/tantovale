import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { describeRoute } from "hono-openapi";
import { env } from "hono/adapter";

import { createRouter } from "#lib/create-app";

export const verifyRoute = createRouter().get(
  "/",
  describeRoute({
    description: "User token verifier",
    responses: {
      200: {
        description: "Token verified succesfully",
        content: {},
      },
      401: {
        description: "No token provided",
      },
      500: {
        description: "Error processing request",
      },
    },
  }),
  async (c) => {
    const { ACCESS_TOKEN_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
    }>(c);

    try {
      // Get the signed access token from cookies
      const accessToken = getCookie(c, "access_token");

      if (!accessToken) {
        return c.json({ message: "No token provided" }, 401);
      }

      // Verify and decode the token
      const payload = await verify(accessToken, ACCESS_TOKEN_SECRET);

      if (!payload) return c.json({ message: "Invalid token" }, 401);

      return c.json(
        {
          message: "Token verified succesfully",
          user: {
            id: payload.id as number,
            username: payload.username as string,
            email_verified: payload.email_verified as boolean,
            phone_verified: payload.phone_verified as boolean,
          },
        },
        200,
      );
    } catch (err) {
      console.error("Error processing request: ", err);
      return c.json({ message: "Error processing request" }, 500);
    }
  },
);
