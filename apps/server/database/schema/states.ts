import { pgTable, varchar, numeric, integer } from "drizzle-orm/pg-core";
import { countries } from "./countries";
import { relations } from "drizzle-orm";
import { cities } from "./cities";

export const states = pgTable("states", {
  id: integer("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  country_id: integer("country_id")
    .notNull()
    .references(() => countries.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  country_code: varchar("country_code", { length: 2 }).notNull(),
  state_code: varchar("state_code", { length: 10 }),
  type: varchar("type", { length: 50 }),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
});

export const statesRelations = relations(states, ({ one, many }) => ({
  country: one(countries, {
    fields: [states.country_id],
    references: [countries.id],
  }),
  cities: many(cities),
}));

export type SelectState = typeof states.$inferSelect;
export type InsertState = typeof states.$inferInsert;
