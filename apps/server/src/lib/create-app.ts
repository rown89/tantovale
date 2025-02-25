import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { authPath, getNodeEnvMode } from "../utils/constants";
import { notFound, onError, serveEmojiFavicon } from "stoker/middlewares";
import { pinoLogger } from "../middlewares/pino-loggers";
import { authMiddleware } from "../middlewares/auth";
import { parseEnv } from "../env";
import type { AppBindings } from "./types";

export function createRouter() {
  return new Hono<AppBindings>();
}

export function createApp() {
  const app = createRouter();

  app.use((c, next) => {
    c.env = parseEnv(Object.assign(c.env || {}, process.env));
    return next();
  });

  app.use("*", async (c, next) => {
    const { isProductionMode } = getNodeEnvMode(c.env.NODE_ENV);

    const corsMiddleware = cors({
      origin: isProductionMode
        ? `https://tantovale.it`
        : "http://localhost:3000",

      allowHeaders: [
        "Origin",
        "Content-Type",
        "x-middleware-subrequest",
        "Authorization",
      ],
      allowMethods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
      credentials: true,
    });

    await corsMiddleware(c, next);
  });

  app.use(serveEmojiFavicon("📝"));
  app.use(pinoLogger());

  app.notFound(notFound);
  app.onError(onError);

  app.use(`/${authPath}/*`, authMiddleware);

  return app;
}
