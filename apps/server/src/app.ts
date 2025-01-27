import { Hono } from "hono";
import type { JwtVariables } from "hono/jwt";
import { bearerAuth } from "hono/bearer-auth";
import { hc } from "hono/client";
import { logger } from "hono/logger";
import { productsRoute } from "./routes/products";
import { getCookie } from "hono/cookie";
import { loginRoute } from "./routes/login";

type Variables = JwtVariables;

const app = new Hono<{ Variables: Variables }>();

app.use("*", logger());

const apiRoutes = app
  .basePath("/server")
  .route("/products", productsRoute)
  .route("/login", loginRoute);

app.use(
  "/auth/*",
  bearerAuth({
    verifyToken(token, c) {
      return token === getCookie(c, "token");
    },
  }),
);

export const client = hc<typeof apiRoutes>("/");

export default app;
export type ApiRoutes = typeof apiRoutes;
