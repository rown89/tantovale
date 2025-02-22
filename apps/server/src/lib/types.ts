import type { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import type { Environment } from "@/env";
import { type JwtVariables } from "hono/jwt";
export interface AppBindings {
  Bindings: Environment;
  Variables: {
    logger: PinoLogger;
  } & JwtVariables;
}

export type AppAPI = Hono<AppBindings>;
