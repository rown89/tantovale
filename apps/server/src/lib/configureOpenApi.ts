import { apiReference } from "@scalar/hono-api-reference";
import type { AppOpenAPI } from "./types";
import { openAPISpecs } from "hono-openapi";
import { serverUrl } from "./constants";
import { resolver } from "hono-openapi/zod";
import { z } from "zod";

export default function configureOpenAPI(app: AppOpenAPI) {
  app.get(
    "/openapi",
    openAPISpecs(app, {
      documentation: {
        info: {
          title: "Tantovale Honojs",
          version: "1.0.0",
          description: "Tantovale API",
        },
        servers: [
          {
            url: serverUrl,
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
                    // .openapi({ ref: "Bad Request" }),
                  ),
                },
              },
            },
          },
        },
      },
    }),
  );

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
