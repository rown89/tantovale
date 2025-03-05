import { pgTable, integer } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { items } from "./items";
import { filterValues } from "./filter_values";

export const itemsFiltersValues = pgTable("items_filters_values", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  item_id: integer("item_id")
    .notNull()
    .references(() => items.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  filter_value_id: integer("filter_value_id")
    .notNull()
    .references(() => filterValues.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
});

export type SelectItemFilterValue = typeof itemsFiltersValues.$inferSelect;
export type InsertItemFilterValue = typeof itemsFiltersValues.$inferInsert;

export const selectItemFiltersValuesSchema =
  createSelectSchema(itemsFiltersValues);

export const insertItemFiltersValuesSchema =
  createInsertSchema(itemsFiltersValues);

export const patchItemFiltersValuesSchema =
  insertItemFiltersValuesSchema.partial();
