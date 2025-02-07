import "dotenv/config";

import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { hc } from "hono/client";
import { logger } from "hono/logger";
import { getCookie } from "hono/cookie";
import { openAPISpecs } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { apiReference } from "@scalar/hono-api-reference";
import { z } from "zod";

import type { JwtVariables } from "hono/jwt";

import {
  itemsRoute,
  loginRoute,
  signupRoute,
  verifyRoute,
  refreshRoute,
  logoutRoute,
  passwordRoute,
} from "./routes";
import { isDevelopmentMode } from "./lib/utils";

type Variables = JwtVariables;

const version = process.env.SERVER_VERSION;
export const app = new Hono<{ Variables: Variables }>();

const serverUrl = `${isDevelopmentMode ? "http" : "https"}://${process.env.SERVER_HOSTNAME}:${process.env.SERVER_PORT}`;

app.use("*", logger());
app.use(
  "/auth/*",
  bearerAuth({
    verifyToken(token, c) {
      return token === getCookie(c, "token");
    },
  }),
);

app.get(
  "/openapi",
  openAPISpecs(app, {
    documentation: {
      info: {
        title: "Tantovale Honojs",
        version: "1.0.0",
        description: "Tantovale API",
      },
      servers: [
        {
          url: serverUrl,
        },
      ],
    },
    defaultOptions: {
      GET: {
        responses: {
          400: {
            description: "Zod Error",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    status: z.literal(400),
                    message: z.string(),
                  }),
                  // .openapi({ ref: "Bad Request" }),
                ),
              },
            },
          },
        },
      },
    },
  }),
);

app.get(
  "/",
  apiReference({
    theme: "saturn",
    spec: {
      url: "/openapi",
    },
  }),
);

const apiRoutes = app
  .basePath(`/${version}`)
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/logout", logoutRoute)
  .route("/verify", verifyRoute)
  .route("/refresh", refreshRoute)
  .route("/items", itemsRoute)
  .route("/password", passwordRoute);

export const client = hc<typeof apiRoutes>("/");

export type ApiRoutes = typeof apiRoutes;
