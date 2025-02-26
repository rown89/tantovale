import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { regions } from "./regions";
import { relations } from "drizzle-orm";
import { municipalities } from "./municipalities";

export const provinces = pgTable("provinces", {
  id: integer("id").primaryKey().notNull(),
  province_code: text("province_code").unique().notNull(),
  province_name: text("province_name").notNull(),
  region_code: text("region_code")
    .notNull()
    .references(() => regions.region_code),
});

export const provincesRelations = relations(provinces, ({ one, many }) => ({
  region: one(regions),
  municipalities: many(municipalities),
}));
