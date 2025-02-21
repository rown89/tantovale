import type { Config } from "drizzle-kit";
import { defineConfig } from "drizzle-kit";
import env from "@/env-runtime";

export default defineConfig({
  dialect: "postgresql",
  out: "./database/drizzle/migrations",
  schema: "./database/schema/schema.ts",
  dbCredentials: {
    url: env.DATABASE_URL!,
  },
  extensionsFilters: ["postgis"],
  schemaFilter: "public",
  tablesFilter: "*",

  introspect: {
    casing: "camel",
  },

  migrations: {
    prefix: "timestamp",
    table: "__drizzle_migrations__",
    schema: "public",
  },

  entities: {
    roles: {
      provider: "",
      exclude: [],
      include: [],
    },
  },

  breakpoints: true,
  strict: true,
  verbose: true,
}) satisfies Config;
