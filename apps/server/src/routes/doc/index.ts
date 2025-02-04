import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";

export const docRoute = new Hono().get("/", swaggerUI({ url: "/doc" }));
