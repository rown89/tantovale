import { pgTable, integer } from "drizzle-orm/pg-core";
import { filters } from "./filters";
import { subcategories } from "./subcategories";

export const subCategoryFilters = pgTable("subcategory_filters", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  filter_id: integer("filter_id")
    .notNull()
    .references(() => filters.id, { onDelete: "cascade", onUpdate: "cascade" }),
  subcategory_id: integer("subcategory_id")
    .notNull()
    .references(() => subcategories.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
});

export type SelectCategoryFilter = typeof subCategoryFilters.$inferSelect;
export type InsertCategoryFilter = typeof subCategoryFilters.$inferInsert;
