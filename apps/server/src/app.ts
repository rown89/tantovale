import "dotenv/config";

import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { logger } from "hono/logger";
import { getCookie } from "hono/cookie";
import { openAPISpecs } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { apiReference } from "@scalar/hono-api-reference";
import { z } from "zod";

import {
  itemsRoute,
  loginRoute,
  signupRoute,
  verifyRoute,
  refreshRoute,
  logoutRoute,
  passwordRoute,
} from "./routes";

import type { JwtVariables } from "hono/jwt";
import { isProductionMode, serverUrl, serverVersion } from "./lib/constants";
import { cors } from "hono/cors";

type Variables = JwtVariables;
export interface Bindings {
  NODE_ENV: string;
}

export const app = new Hono<{ Variables: Variables; Bindings: Bindings }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: isProductionMode ? "https://tantovale.it" : "http://localhost:3000",
    allowMethods: ["*"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"], // Allow specific headers
    maxAge: 86400,
    credentials: true,
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

app.use(
  "/auth/*",
  bearerAuth({
    verifyToken(token, c) {
      return token === getCookie(c, "token");
    },
  }),
);

const apiRoutes = app
  .basePath(`/${serverVersion}`)
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/logout", logoutRoute)
  .route("/verify", verifyRoute)
  .route("/refresh", refreshRoute)
  .route("/items", itemsRoute)
  .route("/password", passwordRoute);

export type ApiRoutes = typeof apiRoutes;
