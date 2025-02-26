import { pgEnum } from "drizzle-orm/pg-core";

export const conditionsEnum = pgEnum("conditions", ["new", "used", "damaged"]);
export const statusEnum = pgEnum("status", ["available", "sold"]);
export const deliveryMethodEnum = pgEnum("delivery_method", [
  "shipping",
  "pickup",
]);
export const sexEnum = pgEnum("sex", ["male", "female"]);
export const profileEnum = pgEnum("profile_type", ["private", "professional"]);
export const filterTypeEnum = pgEnum("filter_type", [
  "text",
  "number",
  "boolean",
  "select",
  "range",
]);
