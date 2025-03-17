import "dotenv/config";

import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema/schema";
import { Resource } from "sst";

const { Pool } = pkg;

export type DrizzleClient = {
  db: NodePgDatabase<typeof schema>;
  client: typeof Pool;
};

export const dbConnection = {
  user: Resource.Tantovale_Postgres.username,
  password: Resource.Tantovale_Postgres.password,
  host: Resource.Tantovale_Postgres.host,
  port: Resource.Tantovale_Postgres.port,
  database: Resource.Tantovale_Postgres.database,
};

const pool = new Pool(dbConnection);

export function createClient() {
  const client = pool;

  const db = drizzle(client, {
    schema,
  });

  return { db, client };
}
