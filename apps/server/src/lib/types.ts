import type { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import type { Environment } from "../env";
import type { LambdaContext, LambdaEvent } from "hono/aws-lambda";

export interface AppBindings {
  event: LambdaEvent;
  lambdaContext: LambdaContext;
  Bindings: Environment;
  Variables: {
    user: {
      id: number;
      username: string;
      email_verified: boolean;
      phone_verified: boolean;
    };
    logger: PinoLogger;
  };
}

export type AppAPI = Hono<AppBindings>;
