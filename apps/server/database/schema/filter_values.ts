import { pgTable, integer, text, index, boolean } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { filters } from "./filters";
import { FilterValuesEnum } from "./enumerated_types";
import { sql } from "drizzle-orm";

export const filterValues = pgTable(
  "filter_values",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    filter_id: integer("filter_id")
      .notNull()
      .references(() => filters.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Constraint Reminder: value & is_boolean can't both co-exist, only one is allowed.
    value: FilterValuesEnum("value"),
    boolean_value: boolean("boolean_value"),
    numeric_value: integer("numeric_value"),
    icon: text("icon"),
    meta: text("meta"),
  },
  (table) => [
    index("value_id_idx").on(table.value),
    // Constraint Reminder: value & is_boolean can't both co-exist, only one is allowed.
    sql`CHECK (
      (value IS NOT NULL AND is_boolean IS NULL) OR 
      (value IS NULL AND is_boolean IS NOT NULL)
    )`,
  ],
);

export type SelectFilterValue = typeof filterValues.$inferSelect;
export type InsertFilterValue = typeof filterValues.$inferInsert;

export const selectFilterValuesSchema = createSelectSchema(filterValues);

export const insertFilterValuesSchema = createInsertSchema(filterValues);

export const patchFilterValuesSchema = insertFilterValuesSchema.partial();
