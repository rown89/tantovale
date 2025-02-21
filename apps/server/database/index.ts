import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/schema";
import { type Environment } from "@/env";

export function createDb(env: Environment) {
  const client = new Pool({
    connectionString: env.DATABASE_URL,
  });

  const db = drizzle(client, {
    schema,
  });

  return { db, client };
}
