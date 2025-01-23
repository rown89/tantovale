import { serve } from "@hono/node-server";
import app from "./app.js";

serve({
  fetch: app.fetch,
  port: 4100,
});

const runServer = () => {
  console.log(`Server run on, 4000`);

  serve({
    fetch: app.fetch,
    port: 4000,
  });
};

runServer();
