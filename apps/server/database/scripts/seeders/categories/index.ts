import { seedDatabase } from "./seeder";

const databaseUrl = process.env.DATABASE_URL ?? "";

seedDatabase(databaseUrl)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed database:", error);
    process.exit(1);
  });
