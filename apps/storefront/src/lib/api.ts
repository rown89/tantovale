import "dotenv/config";

import { type ApiRoutes } from "@workspace/server/apiRoutes";
import { hc as honoClient } from "hono/client";
import { serverUrl, serverVersion } from "@workspace/server/lib/constants";

export const client = honoClient<ApiRoutes>(`${serverUrl}/`)?.[serverVersion];
