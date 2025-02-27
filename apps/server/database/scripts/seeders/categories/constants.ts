import type { SubcategorySeeds, FilterSeed } from "./types";

export const Categories = {
  ELECTRONIC: "electronic",
  CLOTHING: "clothing",
  KIDS: "kids",
  COLLECTABLES: "collectables",
};

export const Subcategories = {
  LAPTOPS: "laptops",
  SMARTPHONES: "smartphones",
  CAMERAS: "cameras",
  ADULT: "adult",
  KIDS: "kids",
  MAN_ADULT: "man_adult",
  WOMEN_ADULT: "women_adult",
  MAN_KIDS: "man_kids",
  GIRL_KIDS: "girl_kids",
  TOYS: "toys",
  BOOK_KIDS: "book_kids",
  SINGLE_CARDS: "single_cards",
  UNCUT_PAPER_SHEET: "uncut_paper_sheet",
};

export const Filters = {
  CONDITION: "condition",
  GENDER: "gender",
  COLOR: "color",
  MATERIAL_CLOTHING: "material_clothing",
  SIZE_CLOTHING: "size_clothing",
  SIZE_PHONE_SCREEN: "size_phone_screen",
};

export const FilterTypes = {
  SELECT: "select",
  BOOLEAN: "boolean",
  TEXT: "text",
} as const;

export const CATEGORY_SEEDS = [
  { name: "Electronic", slug: Categories.ELECTRONIC },
  { name: "Clothing", slug: Categories.CLOTHING },
  { name: "Kids", slug: Categories.KIDS },
  { name: "Collectables", slug: Categories.COLLECTABLES },
];

export const SUBCATEGORY_SEEDS: SubcategorySeeds = {
  electronic: [
    { name: "Laptops", slug: Subcategories.LAPTOPS },
    { name: "Smartphones", slug: Subcategories.SMARTPHONES },
    { name: "Cameras", slug: Subcategories.CAMERAS },
  ],
  clothing: [
    {
      parent: { name: "Adult", slug: Subcategories.ADULT },
      children: [
        { name: "Man", slug: Subcategories.MAN_ADULT },
        { name: "Women", slug: Subcategories.WOMEN_ADULT },
      ],
    },
    {
      parent: { name: "Kids", slug: Subcategories.KIDS },
      children: [
        { name: "Boy", slug: Subcategories.MAN_KIDS },
        { name: "Girl", slug: Subcategories.GIRL_KIDS },
      ],
    },
  ],
  kids: [
    { name: "Toys", slug: Subcategories.TOYS },
    { name: "Books", slug: Subcategories.BOOK_KIDS },
  ],
  collectables: [
    { name: "Single Cards", slug: Subcategories.SINGLE_CARDS },
    { name: "Uncut paper sheet", slug: Subcategories.UNCUT_PAPER_SHEET },
  ],
};

export const FILTER_SEEDS: FilterSeed[] = [
  // Generic
  { name: "Condition", slug: Filters.CONDITION, type: FilterTypes.SELECT },
  { name: "Gender", slug: Filters.GENDER, type: FilterTypes.SELECT },
  { name: "Color", slug: Filters.COLOR, type: FilterTypes.SELECT },
  // Clothing
  {
    name: "Size Clothing",
    slug: Filters.SIZE_CLOTHING,
    type: FilterTypes.SELECT,
  },
  {
    name: "Material Clothing",
    slug: Filters.MATERIAL_CLOTHING,
    type: FilterTypes.SELECT,
  },
  // Phone
  {
    name: "Phone Screen Size",
    slug: Filters.SIZE_PHONE_SCREEN,
    type: FilterTypes.SELECT,
  },
];

export const FILTER_VALUES = [
  { slug: Filters.CONDITION, value: "New" },
  { slug: Filters.CONDITION, value: "Used - Like New" },
  { slug: Filters.CONDITION, value: "Used - Good" },
  { slug: Filters.CONDITION, value: "Used - Fair" },
  { slug: Filters.GENDER, value: "Unisex" },
  { slug: Filters.GENDER, value: "Men" },
  { slug: Filters.GENDER, value: "Women" },
  { slug: Filters.COLOR, value: "Black" },
  { slug: Filters.COLOR, value: "White" },
  { slug: Filters.COLOR, value: "Red" },
  { slug: Filters.COLOR, value: "Blue" },
  { slug: Filters.COLOR, value: "Yellow" },
  { slug: Filters.COLOR, value: "s" },
  { slug: Filters.COLOR, value: "m" },
  { slug: Filters.COLOR, value: "l" },
  { slug: Filters.COLOR, value: "xl" },
  { slug: Filters.COLOR, value: "xxl" },
  { slug: Filters.COLOR, value: "xxxl" },
];
