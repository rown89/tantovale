import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { filterTypeEnum } from "./enumerated_types";

export const filters = pgTable("filters", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: filterTypeEnum("type").notNull(),
});

export type SelectFilter = typeof filters.$inferSelect;
export type InsertFilter = typeof filters.$inferInsert;
