import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { hc } from "hono/client";
import { logger } from "hono/logger";
import { getCookie } from "hono/cookie";
import type { JwtVariables } from "hono/jwt";

import { itemsRoute, loginRoute, signupRoute } from "./routes";

import "dotenv/config";
import { verifyRoute } from "./routes/verify";
import { refreshRoute } from "./routes/refresh";
import { logoutRoute } from "./routes/logout";

type Variables = JwtVariables;

const app = new Hono<{ Variables: Variables }>();

app.use("*", logger());

app.use(
  "/auth/*",
  bearerAuth({
    verifyToken(token, c) {
      return token === getCookie(c, "token");
    },
  }),
);

const apiRoutes = app
  .basePath("/server")
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/logout", logoutRoute)
  .route("/verify", verifyRoute)
  .route("/refresh", refreshRoute)
  .route("/items", itemsRoute);

export const client = hc<typeof apiRoutes>("/");

export default app;
export type ApiRoutes = typeof apiRoutes;
