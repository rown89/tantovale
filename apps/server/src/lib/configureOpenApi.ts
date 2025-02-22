import { apiReference } from "@scalar/hono-api-reference";
import type { AppAPI } from "./types";
import { openAPISpecs } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { z } from "zod";

export function configureOpenAPI(app: AppAPI) {
  // Create an endpoint that builds the OpenAPI spec dynamically
  app.get("/openapi", async (c) => {
    // Get the server URL from the environment
    const serverUrl = `${c.env.NODE_ENV === "development" ? "http" : "https"}://${c.env.SERVER_HOSTNAME}:${c.env.SERVER_PORT}`;

    // Create the spec handler with the dynamic URL
    const handler = openAPISpecs(app, {
      documentation: {
        info: {
          title: "Tantovale Honojs",
          version: "1.0.0",
          description: "Tantovale API",
        },
        servers: [
          {
            url: serverUrl, // using the dynamic value from c.env
          },
        ],
      },
      defaultOptions: {
        GET: {
          responses: {
            400: {
              description: "Zod Error",
              content: {
                "application/json": {
                  schema: resolver(
                    z.object({
                      status: z.literal(400),
                      message: z.string(),
                    }),
                  ),
                },
              },
            },
          },
        },
      },
    });
    // Call the dynamically created handler with the current context
    return handler(c, async () => {});
  });

  // Serve the API reference using the /openapi spec
  app.get(
    "/",
    apiReference({
      theme: "saturn",
      spec: {
        url: "/openapi",
      },
    }),
  );
}
