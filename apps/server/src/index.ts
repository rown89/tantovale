import "dotenv/config";

import { serve } from "@hono/node-server";

import { app } from "./app.js";
import { parseEnv } from "./env";

const server_url = parseEnv(process.env).SERVER_HOSTNAME;
const port = parseEnv(process.env).SERVER_PORT;

console.log(`Server is running on port ${server_url}:${port}`);

serve({
  fetch: app.fetch,
  port,
});
