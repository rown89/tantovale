import {
  pgTable,
  integer,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { categories } from "./categories";
import { items } from "./items";

export const subcategories = pgTable("subcategories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  category_id: integer("category_id")
    .notNull()
    .references(() => categories.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  parent_id: integer("parent_id")
    .references((): AnyPgColumn => subcategories.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })
    .default(sql.raw("NULL")),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
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
