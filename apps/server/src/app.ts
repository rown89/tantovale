import "dotenv/config";

import { Hono } from "hono";
import { logger } from "hono/logger";
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
  passwordForgotRoute,
  passwordResetRoute,
  passwordResetVerifyToken,
} from "./routes";

import {
  authPath,
  isProductionMode,
  serverUrl,
  serverVersion,
} from "./lib/constants";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { profileRoute } from "./routes/profile";
import { meRoute } from "./routes/me";

import { type JwtVariables } from "hono/jwt";

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
    origin: isProductionMode ? "https://tantovale.it" : "http://localhost:3000",
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
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

app.use(`${serverVersion}/${authPath}/*`, async (c, next) => {
  return await authMiddleware(c, next);
});

const apiRoutes = app
  .basePath(`/${serverVersion}`)
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/logout", logoutRoute)
  .route("/verify", verifyRoute)
  .route("/items", itemsRoute)
  .route("/password", passwordForgotRoute)
  .route(`/${authPath}/logout`, logoutRoute)
  .route(`/${authPath}/me`, meRoute)
  .route(`/${authPath}/refresh`, refreshRoute)
  .route(`/${authPath}/password`, passwordResetRoute)
  .route(`/${authPath}/password`, passwordResetVerifyToken)
  .route(`/${authPath}/profile`, profileRoute);

export type ApiRoutes = typeof apiRoutes;
