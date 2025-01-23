import { Hono } from "hono";
import { hc } from "hono/client";
import { logger } from "hono/logger";
import { productRoute } from "./routes/product";

const app = new Hono();

app.use("*", logger());

const apiRoutes = app.basePath("/api").route("/product", productRoute);

export const client = hc<typeof apiRoutes>("/");

export default app;
export type ApiRoutes = typeof apiRoutes;
