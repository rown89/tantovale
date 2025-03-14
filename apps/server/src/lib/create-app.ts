import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
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

  app.use("*", async (c, next) => {
    const requestOrigin = c.req.header("Origin");

    const allowedOrigins = ["http://localhost:3000", "https://tantovale.it"];

    const isAllowedOrigin =
      requestOrigin && allowedOrigins.includes(requestOrigin);
    const originToUse = isAllowedOrigin
      ? requestOrigin
      : (allowedOrigins?.[0] ?? ""); // Fallback to first allowed origin

    // ✅ Properly handle CORS preflight (OPTIONS) requests
    if (c.req.method === "OPTIONS") {
      const headers = new Headers({
        "Access-Control-Allow-Origin": originToUse,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Origin, Content-Type, X-Requested-With, Accept, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "600",
      });

      return new Response(null, {
        status: 204,
        headers: headers,
      });
    }

    // Continue with normal request processing
    const corsMiddleware = cors({
      origin: originToUse,
      allowHeaders: [
        "Origin",
        "Content-Type",
        "X-Requested-With",
        "Accept",
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
