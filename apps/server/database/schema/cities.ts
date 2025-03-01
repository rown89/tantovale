import {
  pgTable,
  varchar,
  numeric,
  smallint,
  integer,
} from "drizzle-orm/pg-core";
import { countries } from "./countries";
import { states } from "./states";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const cities = pgTable("cities", {
  id: integer("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  state_id: integer("state_id")
    .notNull()
    .references(() => states.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  state_code: varchar("state_code", { length: 255 }).notNull(),
  country_id: integer("country_id")
    .notNull()
    .references(() => countries.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  country_code: varchar("country_code", { length: 2 }).notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: numeric("longitude", { precision: 11, scale: 8 }).notNull(),
  flag: smallint("flag").default(1).notNull(),
  wikiDataId: varchar("wikiDataId", { length: 255 }),
});

export const citiesRelations = relations(cities, ({ one }) => ({
  state: one(states, {
    fields: [cities.state_id],
    references: [states.id],
  }),
  country: one(countries, {
    fields: [cities.country_id],
    references: [countries.id],
  }),
}));

export type SelectCity = typeof cities.$inferSelect;
export type InsertCity = typeof cities.$inferInsert;

export const selectCitiesSchema = createSelectSchema(cities);

export const insertCitiesSchema = createInsertSchema(cities);

export const patchCitiesSchema = insertCitiesSchema.partial();
