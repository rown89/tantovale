import type { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import type { Environment } from "@/env";

export interface AppBindings {
  Bindings: Environment;
  Variables: {
    logger: PinoLogger;
  };
}

export type AppOpenAPI = Hono<AppBindings>;
