import { pgTable, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { items } from "./items";
import { relations } from "drizzle-orm";

export const itemImages = pgTable(
  "item_images",
  {
    id: integer("id").primaryKey().notNull().generatedAlwaysAsIdentity(),
    item_id: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade", onUpdate: "cascade" }),
    url: text("url").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("item_id_idx").on(table.item_id)],
);

export const itemImagesRelations = relations(itemImages, ({ one }) => ({
  item: one(items, {
    fields: [itemImages.item_id],
    references: [items.id],
  }),
}));

export type SelectItemImage = typeof itemImages.$inferSelect;
export type InsertItemImage = typeof itemImages.$inferInsert;
