import { relations } from "drizzle-orm";
import { pgTable, varchar, json, integer } from "drizzle-orm/pg-core";
import { countries } from "./countries";
import { subRegions } from "./subRegions";

export const regions = pgTable("regions", {
  id: integer("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  translations: json("translations").notNull(),
  wikiDataId: varchar("wiki_data_id", { length: 255 }).notNull(),
});

export const regionsRelations = relations(regions, ({ many }) => ({
  countries: many(countries),
  subRegions: many(subRegions),
}));

export type Region = typeof regions.$inferSelect;
