import { Hono } from "hono";
import { hc } from "hono/client";
import { logger } from "hono/logger";
import { productsRoute } from "./routes/products";

const app = new Hono();

app.use("*", logger());

const apiRoutes = app.basePath("/server").route("/products", productsRoute);

export const client = hc<typeof apiRoutes>("/");

export default app;
export type ApiRoutes = typeof apiRoutes;
