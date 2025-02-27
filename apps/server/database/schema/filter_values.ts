import { pgTable, integer, text } from "drizzle-orm/pg-core";
import { filters } from "./filters";

export const filterValues = pgTable("filter_values", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  filter_id: integer("filter_id")
    .notNull()
    .references(() => filters.id, { onDelete: "cascade" }),
  value: text("value"),
});
