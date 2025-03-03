import type { SubcategorySeeds, FilterSeed, FilterValues } from "./types";

export const Categories = {
  ELECTRONICS: "electronics",
  CLOTHINGS: "clothings",
  KIDS: "kids",
  COLLECTABLES: "collectables",
};

export const CATEGORY_SEEDS = [
  { name: "Electronics", slug: Categories.ELECTRONICS },
  { name: "Clothings", slug: Categories.CLOTHINGS },
  { name: "Kids", slug: Categories.KIDS },
  { name: "Collectables", slug: Categories.COLLECTABLES },
];

export const Subcategories = {
  COMPUTERS: "computers",
  LAPTOPS: "laptops",
  DESKTOP_COMPUTER: "desktop_computer",
  PHONES: "phones",
  SMARTPHONES_CELLULARS: "smartphones_cellulares",
  ACCESSORIES: "accessories",
  PHOTOGRAPHY: "photography",
  CAMERAS: "cameras",
  LENSES: "lenses",
  SHOES: "shoes",
  JEANS: "jeans",
  PANTS: "pants",
  KIDS: "kids",
  TOYS: "toys",
  CARDS: "cards",
  BOOK_KIDS: "book_kids",
  SINGLE_CARDS: "single_cards",
  UNCUT_PAPER_SHEET: "uncut_paper_sheet",
} as const;

export type SubcategoryTypes =
  (typeof Subcategories)[keyof typeof Subcategories];

export const SUBCATEGORY_SEEDS: SubcategorySeeds = {
  electronics: [
    {
      parent: { name: "Computers", slug: Subcategories.COMPUTERS },
      children: [
        { name: "Laptops", slug: Subcategories.LAPTOPS },
        { name: "Desktop's", slug: Subcategories.DESKTOP_COMPUTER },
        { name: "Accessories", slug: Subcategories.ACCESSORIES },
      ],
    },
    {
      parent: { name: "Phones", slug: Subcategories.PHONES },
      children: [
        {
          name: "Smartphones & Cellulars",
          slug: Subcategories.SMARTPHONES_CELLULARS,
        },
        { name: "Accessories", slug: Subcategories.ACCESSORIES },
      ],
    },
    {
      parent: { name: "Photography", slug: Subcategories.PHOTOGRAPHY },
      children: [
        { name: "Cameras", slug: Subcategories.CAMERAS },
        { name: "Lenses", slug: Subcategories.LENSES },
        { name: "Accessories", slug: Subcategories.ACCESSORIES },
      ],
    },
  ],
  clothings: [
    { name: "Shoes", slug: Subcategories.SHOES },
    { name: "Jeans", slug: Subcategories.JEANS },
    { name: "Pants", slug: Subcategories.PANTS },
    { name: "Accessories", slug: Subcategories.ACCESSORIES },
  ],
  kids: [
    { name: "Toys", slug: Subcategories.TOYS },
    { name: "Books", slug: Subcategories.BOOK_KIDS },
  ],
  collectables: [
    {
      parent: { name: "Cards", slug: Subcategories.CARDS },
      children: [
        { name: "Single Cards", slug: Subcategories.SINGLE_CARDS },
        { name: "Uncut paper sheet", slug: Subcategories.UNCUT_PAPER_SHEET },
      ],
    },
  ],
};

export const Filters = {
  CONDITION: "condition",
  GENDER: "gender",
  COLOR: "color",
  MATERIAL_CLOTHING: "material_clothing",
  SIZE_CLOTHING: "size_clothing",
  SIZE_SHOES: "size_shoes",
  SIZE_WATCHES: "size_watches",
  SIZE_PHONE_SCREEN: "size_phone_screen",
  SIZE_MONITOR_SCREEN: "size_monitor_screen",
} as const;

export type FiltersTypes = (typeof Filters)[keyof typeof Filters];

export const FilterTypes = {
  SELECT: "select",
  BOOLEAN: "boolean",
  TEXT: "text",
  NUMBER: "number",
  RANGE: "range",
} as const;

export const FILTER_SEEDS: FilterSeed[] = [
  // Generic
  { name: "Condition", slug: Filters.CONDITION, type: FilterTypes.SELECT },
  { name: "Gender", slug: Filters.GENDER, type: FilterTypes.SELECT },
  { name: "Color", slug: Filters.COLOR, type: FilterTypes.SELECT },
  // Clothing
  {
    name: "Clothing sizes",
    slug: Filters.SIZE_CLOTHING,
    type: FilterTypes.SELECT,
  },
  {
    name: "Shoes sizes",
    slug: Filters.SIZE_SHOES,
    type: FilterTypes.SELECT,
  },
  {
    name: "Watches size",
    slug: Filters.SIZE_WATCHES,
    type: FilterTypes.SELECT,
  },
  {
    name: "Clothing Materials",
    slug: Filters.MATERIAL_CLOTHING,
    type: FilterTypes.SELECT,
  },
  // Phone
  {
    name: "Phone Screen Sizes",
    slug: Filters.SIZE_PHONE_SCREEN,
    type: FilterTypes.SELECT,
  },
  {
    name: "Monitor Screen Sizes",
    slug: Filters.SIZE_MONITOR_SCREEN,
    type: FilterTypes.SELECT,
  },
];

export const FILTER_VALUES: FilterValues[] = [
  // CONDITIONS
  { slug: Filters.CONDITION, value: "new" },
  { slug: Filters.CONDITION, value: "used-like-new" },
  { slug: Filters.CONDITION, value: "used-good" },
  { slug: Filters.CONDITION, value: "used-fair" },
  // GENDER
  { slug: Filters.GENDER, value: "unisex" },
  { slug: Filters.GENDER, value: "men" },
  { slug: Filters.GENDER, value: "women" },
  // CLOTHING MATERIALS
  { slug: Filters.MATERIAL_CLOTHING, value: "leather" },
  { slug: Filters.MATERIAL_CLOTHING, value: "cotton" },
  { slug: Filters.MATERIAL_CLOTHING, value: "wool" },
  { slug: Filters.MATERIAL_CLOTHING, value: "silk" },
  { slug: Filters.MATERIAL_CLOTHING, value: "linen" },
  { slug: Filters.MATERIAL_CLOTHING, value: "polyester" },
  { slug: Filters.MATERIAL_CLOTHING, value: "nylon" },
  { slug: Filters.MATERIAL_CLOTHING, value: "rayon" },
  { slug: Filters.MATERIAL_CLOTHING, value: "spandex" },
  { slug: Filters.MATERIAL_CLOTHING, value: "acrylic" },
  { slug: Filters.MATERIAL_CLOTHING, value: "viscose" },
  { slug: Filters.MATERIAL_CLOTHING, value: "denim" },
  { slug: Filters.MATERIAL_CLOTHING, value: "leather" },
  { slug: Filters.MATERIAL_CLOTHING, value: "suede" },
  { slug: Filters.MATERIAL_CLOTHING, value: "velvet" },
  { slug: Filters.MATERIAL_CLOTHING, value: "cashmere" },
  { slug: Filters.MATERIAL_CLOTHING, value: "corduroy" },
  { slug: Filters.MATERIAL_CLOTHING, value: "tweed" },
  { slug: Filters.MATERIAL_CLOTHING, value: "flannel" },
  { slug: Filters.MATERIAL_CLOTHING, value: "canvas" },
  { slug: Filters.MATERIAL_CLOTHING, value: "hemp" },
  { slug: Filters.MATERIAL_CLOTHING, value: "bamboo" },
  { slug: Filters.MATERIAL_CLOTHING, value: "fleece" },
  { slug: Filters.MATERIAL_CLOTHING, value: "microfiber" },
  { slug: Filters.MATERIAL_CLOTHING, value: "modal" },
  { slug: Filters.MATERIAL_CLOTHING, value: "jacquard" },
  { slug: Filters.MATERIAL_CLOTHING, value: "chiffon" },
  { slug: Filters.MATERIAL_CLOTHING, value: "taffeta" },
  { slug: Filters.MATERIAL_CLOTHING, value: "satin" },
  { slug: Filters.MATERIAL_CLOTHING, value: "gabardine" },
  { slug: Filters.MATERIAL_CLOTHING, value: "terrycloth" },
  { slug: Filters.MATERIAL_CLOTHING, value: "seersucker" },
  { slug: Filters.MATERIAL_CLOTHING, value: "batiste" },
  { slug: Filters.MATERIAL_CLOTHING, value: "muslin" },
  { slug: Filters.MATERIAL_CLOTHING, value: "organza" },
  { slug: Filters.MATERIAL_CLOTHING, value: "tulle" },
  // COLORS
  { slug: Filters.COLOR, value: "black" },
  { slug: Filters.COLOR, value: "white" },
  { slug: Filters.COLOR, value: "red" },
  { slug: Filters.COLOR, value: "blue" },
  { slug: Filters.COLOR, value: "yellow" },
  { slug: Filters.COLOR, value: "green" },
  { slug: Filters.COLOR, value: "orange" },
  { slug: Filters.COLOR, value: "purple" },
  { slug: Filters.COLOR, value: "pink" },
  { slug: Filters.COLOR, value: "brown" },
  { slug: Filters.COLOR, value: "gray" },
  { slug: Filters.COLOR, value: "beige" },
  { slug: Filters.COLOR, value: "cyan" },
  { slug: Filters.COLOR, value: "magenta" },
  { slug: Filters.COLOR, value: "lime" },
  { slug: Filters.COLOR, value: "olive" },
  { slug: Filters.COLOR, value: "navy" },
  { slug: Filters.COLOR, value: "teal" },
  { slug: Filters.COLOR, value: "maroon" },
  { slug: Filters.COLOR, value: "turquoise" },
  { slug: Filters.COLOR, value: "gold" },
  { slug: Filters.COLOR, value: "silver" },
  { slug: Filters.COLOR, value: "bronze" },
  { slug: Filters.COLOR, value: "ivory" },
  { slug: Filters.COLOR, value: "mustard" },
  { slug: Filters.COLOR, value: "coral" },
  { slug: Filters.COLOR, value: "salmon" },
  { slug: Filters.COLOR, value: "peach" },
  { slug: Filters.COLOR, value: "lavender" },
  { slug: Filters.COLOR, value: "charcoal" },
  { slug: Filters.COLOR, value: "indigo" },
  { slug: Filters.COLOR, value: "periwinkle" },
  { slug: Filters.COLOR, value: "burgundy" },
  { slug: Filters.COLOR, value: "mint" },
  { slug: Filters.COLOR, value: "ochre" },
  { slug: Filters.COLOR, value: "plum" },
  { slug: Filters.COLOR, value: "rust" },
  { slug: Filters.COLOR, value: "saffron" },
  { slug: Filters.COLOR, value: "jade" },
  { slug: Filters.COLOR, value: "violet" },
  // CLOTH SIZES
  { slug: Filters.COLOR, value: "s" },
  { slug: Filters.COLOR, value: "m" },
  { slug: Filters.COLOR, value: "l" },
  { slug: Filters.COLOR, value: "xl" },
  { slug: Filters.COLOR, value: "xxl" },
  { slug: Filters.COLOR, value: "xxxl" },
  // SHOES SIZES
  { slug: Filters.SIZE_SHOES, value: "35" },
  { slug: Filters.SIZE_SHOES, value: "35.5" },
  { slug: Filters.SIZE_SHOES, value: "36" },
  { slug: Filters.SIZE_SHOES, value: "36.5" },
  { slug: Filters.SIZE_SHOES, value: "37" },
  { slug: Filters.SIZE_SHOES, value: "37.5" },
  { slug: Filters.SIZE_SHOES, value: "38" },
  { slug: Filters.SIZE_SHOES, value: "38.5" },
  { slug: Filters.SIZE_SHOES, value: "39" },
  { slug: Filters.SIZE_SHOES, value: "39.5" },
  { slug: Filters.SIZE_SHOES, value: "40" },
  { slug: Filters.SIZE_SHOES, value: "40.5" },
  { slug: Filters.SIZE_SHOES, value: "41" },
  { slug: Filters.SIZE_SHOES, value: "41.5" },
  { slug: Filters.SIZE_SHOES, value: "42" },
  { slug: Filters.SIZE_SHOES, value: "42.5" },
  { slug: Filters.SIZE_SHOES, value: "43" },
  { slug: Filters.SIZE_SHOES, value: "43.5" },
  { slug: Filters.SIZE_SHOES, value: "44" },
  { slug: Filters.SIZE_SHOES, value: "44.5" },
  { slug: Filters.SIZE_SHOES, value: "45" },
  { slug: Filters.SIZE_SHOES, value: "45.5" },
  { slug: Filters.SIZE_SHOES, value: "46" },
  { slug: Filters.SIZE_SHOES, value: "46.5" },
  { slug: Filters.SIZE_SHOES, value: "47" },
  { slug: Filters.SIZE_SHOES, value: "47.5" },
  { slug: Filters.SIZE_SHOES, value: "48" },
  { slug: Filters.SIZE_SHOES, value: "48.5" },
  { slug: Filters.SIZE_SHOES, value: "49" },
  { slug: Filters.SIZE_SHOES, value: "49.5" },
  { slug: Filters.SIZE_SHOES, value: "50" },
  // WATCH WIRST SIZES
  { slug: Filters.SIZE_WATCHES, value: "28mm" },
  { slug: Filters.SIZE_WATCHES, value: "30mm" },
  { slug: Filters.SIZE_WATCHES, value: "32mm" },
  { slug: Filters.SIZE_WATCHES, value: "34mm" },
  { slug: Filters.SIZE_WATCHES, value: "36mm" },
  { slug: Filters.SIZE_WATCHES, value: "38mm" },
  { slug: Filters.SIZE_WATCHES, value: "40mm" },
  { slug: Filters.SIZE_WATCHES, value: "41mm" },
  { slug: Filters.SIZE_WATCHES, value: "42mm" },
  { slug: Filters.SIZE_WATCHES, value: "43mm" },
  { slug: Filters.SIZE_WATCHES, value: "44mm" },
  { slug: Filters.SIZE_WATCHES, value: "45mm" },
  { slug: Filters.SIZE_WATCHES, value: "46mm" },
  { slug: Filters.SIZE_WATCHES, value: "47mm" },
  { slug: Filters.SIZE_WATCHES, value: "48mm" },
  { slug: Filters.SIZE_WATCHES, value: "50mm" },
  { slug: Filters.SIZE_WATCHES, value: "52mm" },
  // PHONE SIZE SCREENS
  { slug: Filters.SIZE_PHONE_SCREEN, value: '3.5"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '4.0"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '4.5"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '5.0"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '5.2"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '5.5"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '5.7"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.0"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.1"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.2"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.3"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.4"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.5"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.6"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.7"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '6.8"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '7.0"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '7.2"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '7.6"' },
  { slug: Filters.SIZE_PHONE_SCREEN, value: '8.0"' },
  // MONITOR SIZE SCREENS
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '15"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '17"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '19"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '20"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '21"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '21.5"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '22"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '23"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '23.6"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '24"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '25"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '27"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '28"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '29"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '30"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '32"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '34"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '35"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '37.5"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '38"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '40"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '42"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '43"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '49"' },
  { slug: Filters.SIZE_MONITOR_SCREEN, value: '55"' },
];

export const SUBCATEGORIES_FILTERS = [
  {
    filterSlug: Filters.GENDER,
    subcategories: [
      {
        slug: Subcategories.PANTS,
        isOptionalField: true,
        isEditableField: false,
      },
      {
        slug: Subcategories.JEANS,
        isOptionalField: false,
        isEditableField: true,
      },
      {
        slug: Subcategories.SHOES,
        isOptionalField: true,
        isEditableField: true,
      },
    ],
  },
  {
    filterSlug: Filters.SIZE_CLOTHING,
    subcategories: [
      {
        slug: Subcategories.PANTS,
        isOptionalField: false,
        isEditableField: true,
      },
      {
        slug: Subcategories.JEANS,
        isOptionalField: false,
        isEditableField: true,
      },
    ],
  },
  {
    filterSlug: Filters.SIZE_SHOES,
    subcategories: [
      {
        slug: Subcategories.SHOES,
        isOptionalField: false,
        isEditableField: true,
      },
    ],
  },
  {
    filterSlug: Filters.SIZE_PHONE_SCREEN,
    subcategories: [
      {
        slug: Subcategories.PHONES,
        isOptionalField: false,
        isEditableField: true,
      },
    ],
  },
  {
    filterSlug: Filters.SIZE_MONITOR_SCREEN,
    subcategories: [
      {
        slug: Subcategories.LAPTOPS,
        isOptionalField: false,
        isEditableField: true,
      },
      {
        slug: Subcategories.DESKTOP_COMPUTER,
        isOptionalField: false,
        isEditableField: true,
      },
    ],
  },
];
