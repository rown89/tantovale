import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { categories } from "./categories";
import { items } from "./items";

export const subcategories = pgTable("subcategories", {
  id: integer("id").primaryKey().notNull().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  category_id: integer("category_id")
    .notNull()
    .references(() => categories.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subcategoriesRelations = relations(
  subcategories,
  ({ one, many }) => ({
    category: one(categories, {
      fields: [subcategories.category_id],
      references: [categories.id],
    }),
    items: many(items),
  }),
);
