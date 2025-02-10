import { type ApiRoutes, serverUrl } from "@workspace/server/apiRoutes";
import { hc as honoClient } from "hono/client";

export const client = () => {
  console.log(serverUrl);

  return honoClient<ApiRoutes>(`${serverUrl}/`);
};
