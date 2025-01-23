import { serve } from "@hono/node-server";
import app from "./app.js";

const PORT = process.env.SERVER_PORT;

const runServer = () => {
  console.log(`Server run on, ${PORT}`);

  serve({
    fetch: app.fetch,
    port: PORT ? parseInt(PORT, 10) : 4000,
  });
};

runServer();
