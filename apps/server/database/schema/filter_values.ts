import { pgTable, integer, text, boolean } from "drizzle-orm/pg-core";
import { filters } from "./filters";
import { items } from "./items";

export const filterValues = pgTable("filter_values", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  item_id: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  filter_id: integer("filter_id")
    .notNull()
    .references(() => filters.id, { onDelete: "cascade" }),
  value_text: text("value_text"), // Per stringhe ("rosso", "M")
  value_number: integer("value_number"), // Per numeri (prezzo, dimensioni)
  value_boolean: boolean("value_boolean"), // Per valori booleani (es: "Disponibile")
});
