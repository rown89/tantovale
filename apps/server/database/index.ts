import "dotenv/config";

import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema/schema";
import { parseEnv, type Environment } from "../../server/src/env";

const { Pool } = pkg;

export type DrizzleClient = {
  db: NodePgDatabase<typeof schema>;
  client: typeof Pool;
};

const pool = new Pool({
  user: parseEnv(process.env).DATABASE_USERNAME,
  password: parseEnv(process.env).DATABASE_PASSWORD,
  host: parseEnv(process.env).DATABASE_HOST,
  port: parseEnv(process.env).DATABASE_PORT,
  database: parseEnv(process.env).DATABASE_NAME,
});

export function createClient() {
  const client = pool;

  const db = drizzle(client, {
    schema,
  });

  return { db, client };
}

export function nodeClient() {
  const client = pool;

  const db = drizzle(client, {
    schema,
  });

  return { db, client };
}
