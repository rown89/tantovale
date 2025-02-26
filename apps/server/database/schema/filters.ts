import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { filterTypeEnum } from "./enumerated_types";

export const filters = pgTable("filters", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: filterTypeEnum("type").notNull(),
});
