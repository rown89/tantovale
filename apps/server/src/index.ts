import { serve } from "@hono/node-server";

import app from "./app";
import { parseEnv } from "./env";

const port = parseEnv(process.env).SERVER_PORT;
console.log(`Server is running on port http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
