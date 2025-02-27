import "dotenv/config";

import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema/schema";
import { type Environment } from "../../server/src/env";

const { Pool } = pkg;

/**
 * Database client return type
 */
export type DrizzleClient = {
  db: NodePgDatabase<typeof schema>;
  client: typeof Pool;
};

export function createWranglerDb(env: Environment) {
  const client = new Pool({
    connectionString: env.DATABASE_URL,
  });

  const db = drizzle(client, {
    schema,
  });

  return { db, client };
}

export function createClient(connectionString: string) {
  const client = new Pool({
    connectionString,
  });

  const db = drizzle(client, {
    schema,
  });

  return { db, client };
}
