import {
  Categories,
  Filters,
  Subcategories,
} from "#database/scripts/seeders/categories/constants";
import { pgEnum } from "drizzle-orm/pg-core";

export const conditionsEnum = pgEnum("conditions", ["new", "used", "damaged"]);
export const statusEnum = pgEnum("status", ["available", "sold"]);
export const deliveryMethodEnum = pgEnum("delivery_method", [
  "shipping",
  "pickup",
]);
export const sexEnum = pgEnum("sex", ["male", "female"]);
export const profileEnum = pgEnum("profile_types", ["private", "professional"]);

export const filtersEnum = pgEnum("filters", [
  Filters.CONDITION,
  Filters.GENDER,
  Filters.COLOR,
  Filters.MATERIAL_CLOTHING,
  Filters.SIZE_CLOTHING,
  Filters.SIZE_SHOES,
  Filters.SIZE_WATCHES,
  Filters.SIZE_PHONE_SCREEN,
  Filters.SIZE_MONITOR_SCREEN,
]);

export const filterTypeEnum = pgEnum("filter_types", [
  "select",
  "boolean",
  "text",
  "number",
  "range",
]);

export const categoriesEnum = pgEnum("categories", [
  Categories.ELECTRONICS,
  Categories.CLOTHINGS,
  Categories.KIDS,
  Categories.COLLECTABLES,
]);

export const SubcategoriesEnum = pgEnum("subcategories", [
  Subcategories.COMPUTERS,
  Subcategories.LAPTOPS,
  Subcategories.DESKTOP_COMPUTER,
  Subcategories.PHONES,
  Subcategories.SMARTPHONES_CELLULARS,
  Subcategories.ACCESSORIES,
  Subcategories.PHOTOGRAPHY,
  Subcategories.CAMERAS,
  Subcategories.LENSES,
  Subcategories.SHOES,
  Subcategories.JEANS,
  Subcategories.PANTS,
  Subcategories.KIDS,
  Subcategories.TOYS,
  Subcategories.CARDS,
  Subcategories.BOOK_KIDS,
  Subcategories.SINGLE_CARDS,
  Subcategories.UNCUT_PAPER_SHEET,
]);
