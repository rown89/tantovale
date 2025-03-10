import { pgTable, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { filters } from "./filters";
import { subcategories } from "./subcategories";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";

export const subCategoryFilters = pgTable(
  "subcategory_filters",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    filter_id: integer("filter_id")
      .notNull()
      .references(() => filters.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    subcategory_id: integer("subcategory_id")
      .notNull()
      .references(() => subcategories.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer("position").notNull().default(0),
    on_create_field_required: boolean("item_create_field_optional")
      .default(false)
      .notNull(),
    on_update_field_editable: boolean("item_update_field_editable")
      .default(true)
      .notNull(),
    is_searchable_field: boolean("is_searchable_field").default(true).notNull(),
  },
  (table) => {
    return {
      // Add a unique constraint to ensure filter_id is unique within each subcategory_id
      unique_filter_per_subcategory: uniqueIndex(
        "unique_filter_per_subcategory",
      ).on(table.filter_id, table.subcategory_id),
    };
  },
);

export type SelectCategoryFilter = typeof subCategoryFilters.$inferSelect;
export type InsertCategoryFilter = typeof subCategoryFilters.$inferInsert;

export const selectSubcategoriesFiltersSchema =
  createSelectSchema(subCategoryFilters);

export const insertSubcategoriesFiltersSchema =
  createInsertSchema(subCategoryFilters);

export const patchSubcategoriesFiltersSchema =
  insertSubcategoriesFiltersSchema.partial();
