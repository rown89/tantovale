import "dotenv/config";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createClient } from ".";
import { fileURLToPath } from "url";
import path from "path";
import { dbConnection } from "./";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const main = async () => {
  const { client } = createClient();

  const { user, password, host, port, database } = dbConnection;

  const db_url = `postgres://${user}:${password}@${host}:${port}/${database}`;

  await migrate(drizzle(db_url), {
    migrationsFolder: `${__dirname}/drizzle/migrations`,
  });
  await client.end();
  process.exit(0);
};

void main();
