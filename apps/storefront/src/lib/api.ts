import { hc } from "hono/client";
import type { ApiRoutesType } from "@workspace/server/apiRoutes";

const NODE_ENV = process.env.NODE_ENV;
const SERVER_HOSTNAME = process.env.NEXT_PUBLIC_SERVER_HOSTNAME;
const SERVER_PORT = process.env.NEXT_PUBLIC_SERVER_PORT;
const isProductionMode = NODE_ENV === "production";

const serverUrl = `${isProductionMode ? "https" : "http"}://${SERVER_HOSTNAME}:${SERVER_PORT}`;

export const client = hc<ApiRoutesType>(`${serverUrl}/`, {
  fetch: (req, requestInit, Env, executionCtx) => {
    return fetch(req, {
      ...requestInit,
      credentials: "include",
    });
  },
});
