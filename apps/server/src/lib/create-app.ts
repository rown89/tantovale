import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { authPath } from "../utils/constants";
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

  const allowedOrigins = [
    "http://localhost:3000",
    process.env.NEXT_PUBLIC_HONO_API_URL,
    "https://tantovale.it",
  ]
    .filter(Boolean)
    // Remove trailing slashes
    .map((origin) => origin?.replace(/\/$/, ""));

  /*
  app.use(
    "*",
    cors({
      origin: (origin, c) => {
        if (allowedOrigins.includes(origin || "")) {
          return origin;
        }
        return allowedOrigins[0];
      },
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Origin",
        "set-cookie",
        "Content-Type",
        "X-Requested-With",
        "Accept",
        "Authorization",
        "x-amzn-RequestId",
        "X-Amzn-Trace-Id",
        "x-request-id",
      ],
      exposeHeaders: ["Content-Length", "Set-Cookie", "Origin"],
      maxAge: 600,
    }),
  );
 */

  app.use(requestId()).use(serveEmojiFavicon("📝")).use(pinoLogger());

  app.notFound(notFound);
  app.onError(onError);

  // paths that require authorization starts with authPath
  app.use(`/${authPath}/*`, authMiddleware);

  return app;
}
