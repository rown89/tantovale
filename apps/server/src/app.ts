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

import { jwt, type JwtVariables } from "hono/jwt";
import { isProductionMode, serverUrl, serverVersion } from "./lib/constants";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { profileRoute } from "./routes/profile";

type Variables = JwtVariables;
export interface Bindings {
  NODE_ENV: string;
  ACCESS_TOKEN_SECRET: string;
}

export const app = new Hono<{ Variables: Variables; Bindings: Bindings }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: isProductionMode ? "https://tantovale.it" : "*",
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

app.use(`${serverVersion}/auth/*`, (c, next) => {
  console.log("XXX");

  return authMiddleware(c, next);
});

const apiRoutes = app
  .basePath(`/${serverVersion}`)
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/logout", logoutRoute)
  .route("/verify", verifyRoute)
  .route("/refresh", refreshRoute)
  .route("/items", itemsRoute)
  .route("/password", passwordRoute)
  .route("/auth/profile", profileRoute);

export type ApiRoutes = typeof apiRoutes;
