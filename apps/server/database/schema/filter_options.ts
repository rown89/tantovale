import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { filters } from "./filters";

export const filterOptions = pgTable("filter_options", {
  id: integer("id").primaryKey().notNull(),
  filterId: integer("filter_id")
    .notNull()
    .references(() => filters.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
});

export type SelectFilterOption = typeof filterOptions.$inferSelect;
export type InsertFilterOption = typeof filterOptions.$inferInsert;

export const selectFilterOptionsSchema = createSelectSchema(filterOptions);

export const insertFilterOptionsSchema = createInsertSchema(filterOptions);

export const patchFilterOptionsSchema = insertFilterOptionsSchema.partial();
