import type { ApiRoutesType } from "@workspace/server/apiRoutes";
import { hc } from "hono/client";

// env injected from sst.aws.Nextjs
const serverUrl = process.env.NEXT_PUBLIC_HONO_API_URL;

export const client = hc<ApiRoutesType>(`${serverUrl}/`, {
  init: {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  },
});
