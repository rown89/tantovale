import { Hono } from "hono";
import { getCookie, getSignedCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type { AppBindings } from "@/lib/types";
import { describeRoute } from "hono-openapi";

export const verifyRoute = new Hono<AppBindings>().get(
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
    const { ACCESS_TOKEN_SECRET, COOKIE_SECRET } = c.env;

    try {
      // Get the signed access token from cookies
      const accessToken = getCookie(c, "access_token");
      // const accessToken = await getSignedCookie(c, COOKIE_SECRET, "access_token");
      if (!accessToken) {
        return c.json(
          { message: "No token provided", cookie: accessToken },
          401,
        );
      }

      // Verify and decode the token
      const payload = await verify(accessToken, ACCESS_TOKEN_SECRET);

      if (!payload) return c.json({ message: "Invalid token" }, 401);

      return c.json(
        {
          message: "Token verified succesfully",
          user: {
            id: payload.id,
            username: payload.username,
            email_verified: payload.email_verified,
            phone_verified: payload.phone_verified,
            exp: payload.exp,
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
