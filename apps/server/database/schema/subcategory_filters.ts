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
    on_item_create_required: boolean("on_item_create_required")
      .default(false)
      .notNull(),
    on_item_update_editable: boolean("on_item_update_editable")
      .default(true)
      .notNull(),
    is_searchable: boolean("is_searchable").default(true).notNull(),
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
