import { serve } from "@hono/node-server";
import { app } from "./app";
import { showRoutes } from "hono/dev";

import "dotenv/config";

const PORT = process.env.SERVER_PORT || "4000";

const runServer = async () => {
  try {
    console.log(`Server in running on port: ${PORT}`);

    serve({
      fetch: app.fetch,
      port: PORT ? parseInt(PORT, 10) : 4000,
    });

    console.log("DB: ", process.env.DATABASE_URL);
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

    if (process.env.NODE_ENV === "development") {
      console.log("Running in development mode!!!");
      showRoutes(app);
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

runServer();
