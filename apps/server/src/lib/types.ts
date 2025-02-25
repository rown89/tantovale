import type { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import type { Environment } from "../env";
import { type JwtVariables } from "hono/jwt";

export interface AppBindings {
  Bindings: Environment;
  Variables: {
    user: {
      id: number;
      username: string;
      email_verified: boolean;
      phone_verified: boolean;
    };
    logger: PinoLogger;
  } & JwtVariables;
}

export type AppAPI = Hono<AppBindings>;
