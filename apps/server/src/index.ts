import { serve } from "@hono/node-server";
import app from "./app.js";

const runServer = () => {
  console.log(`Server run on, ${process.env.SERVER_PORT}`);

  serve({
    fetch: app.fetch,
    port: process.env.SERVER_PORT
      ? parseInt(process.env.SERVER_PORT, 10)
      : 4000,
  });
};

runServer();
