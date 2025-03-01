import { pgTable, integer } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { items } from "./items";
import { filterValues } from "./filter_values";

export const itemProperties = pgTable("item_properties", {
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

export type SelectItemPropertyFilter = typeof itemProperties.$inferSelect;
export type InsertItemPropertyFilter = typeof itemProperties.$inferInsert;

export const selectItemPropertiesFiltersSchema =
  createSelectSchema(itemProperties);

export const insertItemPropertiesFiltersSchema =
  createInsertSchema(itemProperties);

export const patchItemPropertiesFiltersSchema =
  insertItemPropertiesFiltersSchema.partial();
