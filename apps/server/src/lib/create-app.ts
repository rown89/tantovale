import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { authPath, isProductionMode } from "./constants";
import { notFound, onError, serveEmojiFavicon } from "stoker/middlewares";
import { pinoLogger } from "../middlewares/pino-loggers";
import { authMiddleware } from "../middlewares/auth";
import { parseEnv } from "@/env";
import type { AppBindings } from "./types";

export function createRouter() {
  return new Hono<AppBindings>({
    strict: false,
  });
}

export default function createApp() {
  const app = createRouter();

  app.use((c, next) => {
    c.env = parseEnv(Object.assign(c.env || {}, process.env));
    return next();
  });
  app.use(serveEmojiFavicon("📝"));
  app.use(pinoLogger());

  app.notFound(notFound);
  app.onError(onError);

  app.use(
    "*",
    cors({
      origin: isProductionMode
        ? "https://tantovale.it"
        : "http://localhost:3000",
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["*"],
    }),
  );

  app.use(`/${authPath}/*`, authMiddleware);

  return app;
}
