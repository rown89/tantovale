import { pgTable, integer, index } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { filters } from "./filters";
import { FilterValuesEnum } from "./enumerated_types";

export const filterValues = pgTable(
  "filter_values",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    filter_id: integer("filter_id")
      .notNull()
      .references(() => filters.id, { onDelete: "cascade" }),
    value: FilterValuesEnum("value"),
  },
  (table) => [index("value_id_idx").on(table.value)],
);

export type SelectFilterValue = typeof filterValues.$inferSelect;
export type InsertFilterValue = typeof filterValues.$inferInsert;

export const selectFilterValuesSchema = createSelectSchema(filterValues);

export const insertFilterValuesSchema = createInsertSchema(filterValues);

export const patchFilterValuesSchema = insertFilterValuesSchema.partial();
