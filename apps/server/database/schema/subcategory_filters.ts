import { pgTable, integer, boolean } from "drizzle-orm/pg-core";
import { filters } from "./filters";
import { subcategories } from "./subcategories";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

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
  isOptionalField: boolean("isOptionalField").default(false).notNull(),
  isEditableField: boolean("isEditableField").default(true).notNull(),
});

export type SelectCategoryFilter = typeof subCategoryFilters.$inferSelect;
export type InsertCategoryFilter = typeof subCategoryFilters.$inferInsert;

export const selectSubcategoriesFiltersSchema =
  createSelectSchema(subCategoryFilters);

export const insertSubcategoriesFiltersSchema =
  createInsertSchema(subCategoryFilters);

export const patchSubcategoriesFiltersSchema =
  insertSubcategoriesFiltersSchema.partial();
