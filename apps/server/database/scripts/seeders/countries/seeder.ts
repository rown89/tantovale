import { createClient } from "../../../";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  countries,
  states,
  cities,
  regions,
  subRegions,
} from "#database/schema";

// Configuration
const BATCH_SIZE = 1000;
const DATA_DIR = "./data";

// Initialize database client
const { db } = createClient();

// Helper function to read JSON data with type inference
function readJsonFile<T>(filename: string): T[] {
  const filePath = path.resolve(__dirname, DATA_DIR, filename);
  // Use resolve to ensure the correct path

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T[];
  } catch (error) {
    console.error(`Error reading ${filename}:`, (error as Error).message);
    return [] as T[];
  }
}

// Type-safe batch insert function
async function batchInsert<T extends Record<string, any>>(
  table:
    | typeof countries
    | typeof states
    | typeof cities
    | typeof regions
    | typeof subRegions,
  data: T[],
  entityName: string,
): Promise<number> {
  console.log(`✍️ Inserting ${data.length} ${entityName}...`);
  let inserted = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);

    const result = await db
      .insert(table)
      .values(batch as any)
      .onConflictDoNothing()
      .returning();

    inserted += Array.isArray(result) ? result.length : 0;
    console.log(
      `⏳ Progress: ${i + batch.length}/${data.length} processed, ${inserted} inserted`,
    );
  }

  console.log(
    `✅ Completed ${entityName} seeding: ${inserted} records inserted`,
  );

  return inserted;
}

async function insertRegions(): Promise<number> {
  const regionsData = readJsonFile<typeof regions>("./regions.json");

  const regionsReshape = regionsData.map(({ ...values }) => ({
    ...values,
  }));

  return await batchInsert<typeof regions>(regions, regionsReshape, "regions");
}

async function insertSubRegions(): Promise<number> {
  const subRegionsData = readJsonFile<typeof subRegions>("./subregions.json");

  const subRegionsReshape = subRegionsData.map(({ region_id, ...values }) => ({
    ...values,
    region_id: Number(region_id),
  }));

  return await batchInsert<typeof subRegions>(
    subRegions,
    // @ts-expect-error ignore seeder
    subRegionsReshape,
    "subRegions",
  );
}

async function insertCountries(): Promise<number> {
  const countriesData = readJsonFile<
    typeof countries & { subregion_id: number | null; region_id: number | null }
  >("./countries.json");

  const countriesReshape = countriesData.map(({ ...values }) => ({
    ...values,
    subregion_id: values.subregion_id === 0 ? null : values.subregion_id,
    region_id: values.region_id === 0 ? null : values.region_id,
  }));

  return await batchInsert<Omit<typeof countries, "id">>(
    countries,
    // @ts-expect-error ignore seeder
    countriesReshape,
    "countries",
  );
}

async function insertStates(): Promise<number> {
  const statesData = readJsonFile<typeof states>("./states.json");

  const statesReshape = statesData.map(({ ...values }) => ({
    ...values,
  }));

  return await batchInsert<Omit<typeof states, "id">>(
    states,
    statesReshape,
    "states",
  );
}

async function insertCities(): Promise<number> {
  const citiesData = readJsonFile<typeof cities>("./cities.json");

  const citiesReshape = citiesData.map(({ ...values }) => ({
    ...values,
  }));

  return await batchInsert<Omit<typeof cities, "id">>(
    cities,
    citiesReshape,
    "cities",
  );
}

// Main seeding function
export async function seedCountries(): Promise<void> {
  console.log("Starting database seeding...");
  const startTime = Date.now();

  try {
    // Insert referenced tables first to satisfy foreign key constraints
    await insertRegions();
    await insertSubRegions();
    await insertCountries();
    await insertStates();
    await insertCities();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n🌱 Seeding completed successfully in ${duration}s`);
  } catch (error) {
    console.error("\n❌ Seeding failed:", error);
    throw error;
  }
}
