import { z } from "zod";
import { relations } from "drizzle-orm";
import {
  pgTable,
  integer,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users } from "./users";
import { deliveryMethodEnum, statusEnum } from "./enumerated_types";
import { subcategories } from "./subcategories";
import type { createItemSchema } from "../../../server/src/schema";

export const items = pgTable(
  "items",
  {
    id: integer("id").primaryKey().notNull().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: statusEnum("status").notNull().default("available"),
    published: boolean("published").default(false).notNull(),
    price: integer("price").notNull().default(0),
    shipping_cost: integer("shipping_cost").notNull().default(0),
    delivery_method: deliveryMethodEnum("delivery_method")
      .notNull()
      .default("shipping"),
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

export const insertItemsSchema = createInsertSchema(items);

export type createItemTypes = z.infer<typeof createItemSchema>;

export const patchItemsSchema = insertItemsSchema.partial();
