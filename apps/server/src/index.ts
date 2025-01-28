import { serve } from "@hono/node-server";
import app from "./app";

import "dotenv/config";

const PORT = process.env.SERVER_PORT || "4000";

const runServer = () => {
  console.log(`Server run on, ${PORT}`);

  console.log("DB: ", process.env.DATABASE_URL);

  serve({
    fetch: app.fetch,
    port: PORT ? parseInt(PORT, 10) : 4000,
  });
};

runServer();
