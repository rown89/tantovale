import { pgTable, text, varchar, json, integer } from "drizzle-orm/pg-core";
import { regions } from "./regions";
import { relations } from "drizzle-orm";
import { countries } from "./countries";

export const subRegions = pgTable("sub_regions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity().notNull(),
  name: text("name").notNull(),
  region_id: integer("region_id")
    .notNull()
    .references(() => regions.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  translations: json("translations").notNull(),
  wikiDataId: varchar("wiki_data_id", { length: 100 }).notNull(),
});

export const subRegionsRelations = relations(subRegions, ({ one, many }) => ({
  region: one(regions, {
    fields: [subRegions.region_id],
    references: [regions.id],
  }),
  countries: many(countries),
}));

export type SubRegion = typeof subRegions.$inferSelect;
