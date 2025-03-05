import "dotenv/config";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { nodeClient } from ".";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const main = async () => {
  const { client } = nodeClient(process.env.DATABASE_URL!);

  await migrate(drizzle(process.env.DATABASE_URL!), {
    migrationsFolder: `${__dirname}/drizzle/migrations`,
  });
  await client.end();
  process.exit(0);
};

void main();
