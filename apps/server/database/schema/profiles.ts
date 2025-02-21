import {
  pgTable,
  integer,
  timestamp,
  date,
  boolean,
  check,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { items } from "./items";
import { profileEnum, sexEnum } from "./enumerated_types";
import { users } from "./users";

export const profiles = pgTable(
  "profiles",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity().notNull(),
    profile_type: profileEnum("profile_type").notNull(),
    user_id: integer("user_id")
      .unique()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    fullname: varchar("fullname", { length: 255 }).notNull(),
    vat_number: varchar("vat_number", { length: 255 }).notNull(),
    birthday: date("birthday"),
    sex: sexEnum("sex"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "birthday_check1",
      sql`${table.profile_type} != 'private' OR ${table.birthday} IS NOT NULL`,
    ),
    check(
      "sex_check1",
      sql`${table.profile_type} != 'private' OR ${table.sex} IS NOT NULL`,
    ),
  ],
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users),
  items: many(items),
}));
