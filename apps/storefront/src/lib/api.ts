import { hc } from "hono/client";
import type { ApiRoutesType } from "@workspace/server/apiRoutes";

const NODE_ENV = process.env.NODE_ENV;
const NEXT_PUBLIC_SERVER_HOSTNAME = process.env.NEXT_PUBLIC_SERVER_HOSTNAME;
const NEXT_PUBLIC_SERVER_PORT = process.env.NEXT_PUBLIC_SERVER_PORT;
const isProductionMode = NODE_ENV === "production";

const serverUrl = `${isProductionMode ? "https" : "http"}://${NEXT_PUBLIC_SERVER_HOSTNAME}:${NEXT_PUBLIC_SERVER_PORT}`;

export const client = hc<ApiRoutesType>(`${serverUrl}/`, {
  fetch: (req, requestInit, Env, executionCtx) =>
    fetch(req, {
      ...requestInit,
      credentials: "include",
    }),
});
