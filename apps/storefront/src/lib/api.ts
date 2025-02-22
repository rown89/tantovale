import { hc } from "hono/client";
import type { ApiRoutesType } from "@workspace/server/apiRoutes";

export const serverUrl = `${process.env.NODE_ENV === "development" ? "http" : "https"}://${process.env.NEXT_PUBLIC_SERVER_HOSTNAME}:${process.env.NEXT_PUBLIC_SERVER_PORT}`;

export const client = hc<ApiRoutesType>(`${serverUrl}/`, {
  fetch: (req, requestInit, Env, executionCtx) =>
    fetch(req, {
      ...requestInit,
      credentials: "include",
    }),
});
