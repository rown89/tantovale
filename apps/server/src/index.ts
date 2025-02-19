import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { showRoutes } from "hono/dev";

const SERVER_HOSTNAME = process.env.SERVER_HOSTNAME;
const PORT = process.env.SERVER_PORT || "4000";

const runServer = async () => {
  try {
    console.log(`Server running on: ${SERVER_HOSTNAME}`);
    console.log(`Port: ${PORT}`);
    console.log("\nDB:", process.env.DATABASE_URL);

    serve({
      fetch: app.fetch,
      port: PORT ? parseInt(PORT, 10) : 4000,
    });

    if (process.env.NODE_ENV === "development") {
      console.log("\nRunning in development mode!!!");
      console.log(`NODE_ENV: ${process.env.NODE_ENV}\n`);

      showRoutes(app);
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

runServer();
