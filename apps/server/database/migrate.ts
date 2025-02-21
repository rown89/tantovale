import "dotenv/config";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client } from ".";

const main = async () => {
  console.log("XX", __dirname);

  await migrate(drizzle(process.env.DATABASE_URL!), {
    migrationsFolder: `${__dirname}/drizzle/migrations`,
  });
  await client.end();
  process.exit(0);
};

void main();
