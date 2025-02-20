import "dotenv/config";

import { hc } from "hono/client";
import { isDevelopmentMode } from "@workspace/server/lib/constants";

import { type ApiRoutes } from "@workspace/server/apiRoutes";

export const serverUrl = `${isDevelopmentMode ? "http" : "https"}://${process.env.NEXT_PUBLIC_SERVER_HOSTNAME}:${process.env.NEXT_PUBLIC_SERVER_PORT}`;

export const client = hc<ApiRoutes>(`${serverUrl}/`, {
  fetch: (req, requestInit, Env, executionCtx) =>
    fetch(req, {
      ...requestInit,
      credentials: "include",
    }),
});
