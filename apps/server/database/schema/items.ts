import { relations } from "drizzle-orm";
import {
  pgTable,
  integer,
  text,
  timestamp,
  boolean,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import {
  conditionsEnum,
  deliveryMethodEnum,
  statusEnum,
} from "./enumerated_types";
import { subcategories } from "./subcategories";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const items = pgTable(
  "items",
  {
    id: integer("id").primaryKey().notNull().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    condition: conditionsEnum().notNull().default("used"),
    status: statusEnum("status").notNull().default("available"),
    published: boolean("published").default(false).notNull(),
    price: numeric("price", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    shipping_cost: numeric("shipping_cost", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    delivery_method: deliveryMethodEnum("delivery_method")
      .notNull()
      .default("pickup"),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subcategory_id: integer("subcategory_id")
      .notNull()
      .references(() => subcategories.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("user_id_idx").on(table.user_id),
    index("title_idx").on(table.title),
    index("subcategory_id_idx").on(table.subcategory_id),
  ],
);

export const itemsRelations = relations(items, ({ one, many }) => ({
  author: one(users, {
    fields: [items.user_id],
    references: [users.id],
  }),
  subcategory: one(subcategories, {
    fields: [items.subcategory_id],
    references: [subcategories.id],
  }),
}));

export type SelectItem = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

export const selectItemsSchema = createSelectSchema(items);

export const insertItemsSchema = createInsertSchema(items, {
  title: (schema) => schema.min(1).max(200),
  description: (schema) => schema.max(800),
}).omit({
  created_at: true,
  updated_at: true,
});

export const patchItemsSchema = insertItemsSchema.partial();
