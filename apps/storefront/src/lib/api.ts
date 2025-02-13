import "dotenv/config";

import { type ApiRoutes } from "@workspace/server/apiRoutes";
import { hc } from "hono/client";
import { serverUrl, serverVersion } from "@workspace/server/lib/constants";

export const client = hc<ApiRoutes>(`${serverUrl}/`)?.[serverVersion];
