import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { filters } from "./filters";

export const filterOptions = pgTable("filter_options", {
  id: integer("id").primaryKey().notNull(),
  filterId: integer("filter_id")
    .notNull()
    .references(() => filters.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
});
