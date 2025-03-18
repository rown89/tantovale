import type { SubcategorySeeds, FilterSeed, FilterValues } from './types';

export const Categories = {
	ELECTRONICS: 'electronics',
	CLOTHINGS: 'clothings',
	KIDS: 'kids',
	COLLECTABLES: 'collectables',
};

export const CATEGORY_SEEDS = [
	{ name: 'Electronics', slug: Categories.ELECTRONICS },
	{ name: 'Clothings', slug: Categories.CLOTHINGS },
	{ name: 'Kids', slug: Categories.KIDS },
	{ name: 'Collectables', slug: Categories.COLLECTABLES },
];

export const Subcategories = {
	COMPUTERS: 'computers',
	LAPTOPS: 'laptops',
	DESKTOP_COMPUTER: 'desktop_computer',
	PHONES: 'phones',
	SMARTPHONES_CELLULARS: 'smartphones_cellulares',
	ACCESSORIES: 'accessories',
	PHOTOGRAPHY: 'photography',
	CAMERAS: 'cameras',
	LENSES: 'lenses',
	SHOES: 'shoes',
	JEANS: 'jeans',
	PANTS: 'pants',
	KIDS: 'kids',
	TOYS: 'toys',
	CARDS: 'cards',
	BOOK_KIDS: 'book_kids',
	SINGLE_CARDS: 'single_cards',
	UNCUT_PAPER_SHEET: 'uncut_paper_sheet',
} as const;

export type SubcategoryTypes = (typeof Subcategories)[keyof typeof Subcategories];

export const SUBCATEGORY_SEEDS: SubcategorySeeds = {
	electronics: [
		{
			parent: { name: 'Computers', slug: Subcategories.COMPUTERS },
			children: [
				{ name: 'Laptops', slug: Subcategories.LAPTOPS },
				{ name: 'Desktop Computers', slug: Subcategories.DESKTOP_COMPUTER },
				{ name: 'Computer Accessories', slug: Subcategories.ACCESSORIES },
			],
		},
		{
			parent: { name: 'Phones', slug: Subcategories.PHONES },
			children: [
				{
					name: 'Smartphones & Cellulars',
					slug: Subcategories.SMARTPHONES_CELLULARS,
				},
				{ name: 'Phone Accessories', slug: Subcategories.ACCESSORIES },
			],
		},
		{
			parent: { name: 'Photography', slug: Subcategories.PHOTOGRAPHY },
			children: [
				{ name: 'Cameras', slug: Subcategories.CAMERAS },
				{ name: 'Lenses', slug: Subcategories.LENSES },
				{ name: 'Photography Accessories', slug: Subcategories.ACCESSORIES },
			],
		},
	],
	clothings: [
		{ name: 'Shoes', slug: Subcategories.SHOES },
		{ name: 'Jeans', slug: Subcategories.JEANS },
		{ name: 'Pants', slug: Subcategories.PANTS },
		{ name: 'Clothing Accessories', slug: Subcategories.ACCESSORIES },
	],
	kids: [
		{ name: 'Toys', slug: Subcategories.TOYS },
		{ name: 'Books', slug: Subcategories.BOOK_KIDS },
	],
	collectables: [
		{
			parent: { name: 'Cards', slug: Subcategories.CARDS },
			children: [
				{ name: 'Single Cards', slug: Subcategories.SINGLE_CARDS },
				{ name: 'Uncut paper sheet', slug: Subcategories.UNCUT_PAPER_SHEET },
			],
		},
	],
};

export const Filters = {
	CONDITION: 'condition',
	GENDER: 'gender',
	COLOR: 'color',
	MATERIAL_CLOTHING: 'material_clothing',
	SIZE_CLOTHING: 'size_clothing',
	SIZE_SHOES: 'size_shoes',
	SIZE_WATCHES: 'size_watches',
	SIZE_PHONE_SCREEN: 'size_phone_screen',
	SIZE_MONITOR_SCREEN: 'size_monitor_screen',
} as const;

export type FiltersTypes = (typeof Filters)[keyof typeof Filters];

export const FilterTypes = {
	SELECT: 'select',
	SELECT_MULTI: 'select_multi',
	BOOLEAN: 'boolean',
	CHECKBOX: 'checkbox',
	RADIO: 'radio',
	NUMBER: 'number',
	RANGE: 'range',
} as const;

export const FILTER_SEEDS: FilterSeed[] = [
	// Generic
	{ name: 'Condition', slug: Filters.CONDITION, type: FilterTypes.SELECT },
	{ name: 'Gender', slug: Filters.GENDER, type: FilterTypes.RADIO },
	{ name: 'Color', slug: Filters.COLOR, type: FilterTypes.SELECT_MULTI },
	// Clothing
	{
		name: 'Clothing sizes',
		slug: Filters.SIZE_CLOTHING,
		type: FilterTypes.SELECT,
	},
	{
		name: 'Shoes sizes',
		slug: Filters.SIZE_SHOES,
		type: FilterTypes.SELECT,
	},
	{
		name: 'Watches size',
		slug: Filters.SIZE_WATCHES,
		type: FilterTypes.SELECT,
	},
	{
		name: 'Clothing Materials',
		slug: Filters.MATERIAL_CLOTHING,
		type: FilterTypes.SELECT_MULTI,
	},
	// Phone
	{
		name: 'Phone Screen Sizes',
		slug: Filters.SIZE_PHONE_SCREEN,
		type: FilterTypes.SELECT,
	},
	{
		name: 'Monitor Screen Sizes',
		slug: Filters.SIZE_MONITOR_SCREEN,
		type: FilterTypes.SELECT,
	},
];

export const FILTER_VALUES: FilterValues[] = [
	// CONDITIONS
	{ slug: Filters.CONDITION, name: 'New', value: 'new' },
	{ slug: Filters.CONDITION, name: 'Used - Like New', value: 'used-like-new' },
	{ slug: Filters.CONDITION, name: 'Used - Good', value: 'used-good' },
	{ slug: Filters.CONDITION, name: 'Used - Fair', value: 'used-fair' },

	// GENDER
	{ slug: Filters.GENDER, name: 'Unisex', value: 'unisex' },
	{ slug: Filters.GENDER, name: 'Men', value: 'men' },
	{ slug: Filters.GENDER, name: 'Women', value: 'women' },

	// CLOTHING MATERIALS
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Leather', value: 'leather' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Cotton', value: 'cotton' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Wool', value: 'wool' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Silk', value: 'silk' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Linen', value: 'linen' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Polyester', value: 'polyester' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Nylon', value: 'nylon' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Rayon', value: 'rayon' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Spandex', value: 'spandex' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Acrylic', value: 'acrylic' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Viscose', value: 'viscose' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Denim', value: 'denim' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Suede', value: 'suede' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Velvet', value: 'velvet' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Cashmere', value: 'cashmere' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Corduroy', value: 'corduroy' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Tweed', value: 'tweed' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Flannel', value: 'flannel' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Canvas', value: 'canvas' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Hemp', value: 'hemp' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Bamboo', value: 'bamboo' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Fleece', value: 'fleece' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Microfiber', value: 'microfiber' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Modal', value: 'modal' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Jacquard', value: 'jacquard' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Chiffon', value: 'chiffon' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Taffeta', value: 'taffeta' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Satin', value: 'satin' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Gabardine', value: 'gabardine' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Terrycloth', value: 'terrycloth' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Seersucker', value: 'seersucker' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Batiste', value: 'batiste' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Muslin', value: 'muslin' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Organza', value: 'organza' },
	{ slug: Filters.MATERIAL_CLOTHING, name: 'Tulle', value: 'tulle' },

	// COLORS
	{ slug: Filters.COLOR, name: 'Black', value: 'black' },
	{ slug: Filters.COLOR, name: 'White', value: 'white' },
	{ slug: Filters.COLOR, name: 'Red', value: 'red' },
	{ slug: Filters.COLOR, name: 'Blue', value: 'blue' },
	{ slug: Filters.COLOR, name: 'Yellow', value: 'yellow' },
	{ slug: Filters.COLOR, name: 'Green', value: 'green' },
	{ slug: Filters.COLOR, name: 'Orange', value: 'orange' },
	{ slug: Filters.COLOR, name: 'Purple', value: 'purple' },
	{ slug: Filters.COLOR, name: 'Pink', value: 'pink' },
	{ slug: Filters.COLOR, name: 'Brown', value: 'brown' },
	{ slug: Filters.COLOR, name: 'Gray', value: 'gray' },
	{ slug: Filters.COLOR, name: 'Beige', value: 'beige' },
	{ slug: Filters.COLOR, name: 'Cyan', value: 'cyan' },
	{ slug: Filters.COLOR, name: 'Magenta', value: 'magenta' },
	{ slug: Filters.COLOR, name: 'Lime', value: 'lime' },
	{ slug: Filters.COLOR, name: 'Olive', value: 'olive' },
	{ slug: Filters.COLOR, name: 'Navy', value: 'navy' },
	{ slug: Filters.COLOR, name: 'Teal', value: 'teal' },
	{ slug: Filters.COLOR, name: 'Maroon', value: 'maroon' },
	{ slug: Filters.COLOR, name: 'Turquoise', value: 'turquoise' },
	{ slug: Filters.COLOR, name: 'Gold', value: 'gold' },
	{ slug: Filters.COLOR, name: 'Silver', value: 'silver' },
	{ slug: Filters.COLOR, name: 'Bronze', value: 'bronze' },
	{ slug: Filters.COLOR, name: 'Ivory', value: 'ivory' },
	{ slug: Filters.COLOR, name: 'Mustard', value: 'mustard' },
	{ slug: Filters.COLOR, name: 'Coral', value: 'coral' },
	{ slug: Filters.COLOR, name: 'Salmon', value: 'salmon' },
	{ slug: Filters.COLOR, name: 'Peach', value: 'peach' },
	{ slug: Filters.COLOR, name: 'Lavender', value: 'lavender' },
	{ slug: Filters.COLOR, name: 'Charcoal', value: 'charcoal' },
	{ slug: Filters.COLOR, name: 'Indigo', value: 'indigo' },
	{ slug: Filters.COLOR, name: 'Periwinkle', value: 'periwinkle' },
	{ slug: Filters.COLOR, name: 'Burgundy', value: 'burgundy' },
	{ slug: Filters.COLOR, name: 'Mint', value: 'mint' },
	{ slug: Filters.COLOR, name: 'Ochre', value: 'ochre' },
	{ slug: Filters.COLOR, name: 'Plum', value: 'plum' },
	{ slug: Filters.COLOR, name: 'Rust', value: 'rust' },
	{ slug: Filters.COLOR, name: 'Saffron', value: 'saffron' },
	{ slug: Filters.COLOR, name: 'Jade', value: 'jade' },
	{ slug: Filters.COLOR, name: 'Violet', value: 'violet' },

	// CLOTH SIZES
	{ slug: Filters.COLOR, name: 'S', value: 's' },
	{ slug: Filters.COLOR, name: 'M', value: 'm' },
	{ slug: Filters.COLOR, name: 'L', value: 'l' },
	{ slug: Filters.COLOR, name: 'XL', value: 'xl' },
	{ slug: Filters.COLOR, name: 'XXL', value: 'xxl' },
	{ slug: Filters.COLOR, name: 'XXXL', value: 'xxxl' },

	// SHOE SIZES
	{ slug: Filters.SIZE_SHOES, name: '35', value: '35' },
	{ slug: Filters.SIZE_SHOES, name: '35.5', value: '35.5' },
	{ slug: Filters.SIZE_SHOES, name: '36', value: '36' },
	{ slug: Filters.SIZE_SHOES, name: '36.5', value: '36.5' },
	{ slug: Filters.SIZE_SHOES, name: '37', value: '37' },
	{ slug: Filters.SIZE_SHOES, name: '37.5', value: '37.5' },
	{ slug: Filters.SIZE_SHOES, name: '38', value: '38' },
	{ slug: Filters.SIZE_SHOES, name: '38.5', value: '38.5' },
	{ slug: Filters.SIZE_SHOES, name: '39', value: '39' },
	{ slug: Filters.SIZE_SHOES, name: '39.5', value: '39.5' },
	{ slug: Filters.SIZE_SHOES, name: '40', value: '40' },
	{ slug: Filters.SIZE_SHOES, name: '40.5', value: '40.5' },
	{ slug: Filters.SIZE_SHOES, name: '41', value: '41' },
	{ slug: Filters.SIZE_SHOES, name: '41.5', value: '41.5' },
	{ slug: Filters.SIZE_SHOES, name: '42', value: '42' },
	{ slug: Filters.SIZE_SHOES, name: '42.5', value: '42.5' },
	{ slug: Filters.SIZE_SHOES, name: '43', value: '43' },
	{ slug: Filters.SIZE_SHOES, name: '43.5', value: '43.5' },
	{ slug: Filters.SIZE_SHOES, name: '44', value: '44' },
	{ slug: Filters.SIZE_SHOES, name: '44.5', value: '44.5' },
	{ slug: Filters.SIZE_SHOES, name: '45', value: '45' },
	{ slug: Filters.SIZE_SHOES, name: '45.5', value: '45.5' },
	{ slug: Filters.SIZE_SHOES, name: '46', value: '46' },
	{ slug: Filters.SIZE_SHOES, name: '46.5', value: '46.5' },
	{ slug: Filters.SIZE_SHOES, name: '47', value: '47' },
	{ slug: Filters.SIZE_SHOES, name: '47.5', value: '47.5' },
	{ slug: Filters.SIZE_SHOES, name: '48', value: '48' },
	{ slug: Filters.SIZE_SHOES, name: '48.5', value: '48.5' },
	{ slug: Filters.SIZE_SHOES, name: '49', value: '49' },
	{ slug: Filters.SIZE_SHOES, name: '49.5', value: '49.5' },
	{ slug: Filters.SIZE_SHOES, name: '50', value: '50' },

	// WATCH WRIST SIZES
	{ slug: Filters.SIZE_WATCHES, name: '28mm', value: '28mm' },
	{ slug: Filters.SIZE_WATCHES, name: '30mm', value: '30mm' },
	{ slug: Filters.SIZE_WATCHES, name: '32mm', value: '32mm' },
	{ slug: Filters.SIZE_WATCHES, name: '34mm', value: '34mm' },
	{ slug: Filters.SIZE_WATCHES, name: '36mm', value: '36mm' },
	{ slug: Filters.SIZE_WATCHES, name: '38mm', value: '38mm' },
	{ slug: Filters.SIZE_WATCHES, name: '40mm', value: '40mm' },
	{ slug: Filters.SIZE_WATCHES, name: '41mm', value: '41mm' },
	{ slug: Filters.SIZE_WATCHES, name: '42mm', value: '42mm' },
	{ slug: Filters.SIZE_WATCHES, name: '43mm', value: '43mm' },
	{ slug: Filters.SIZE_WATCHES, name: '44mm', value: '44mm' },
	{ slug: Filters.SIZE_WATCHES, name: '45mm', value: '45mm' },
	{ slug: Filters.SIZE_WATCHES, name: '46mm', value: '46mm' },
	{ slug: Filters.SIZE_WATCHES, name: '47mm', value: '47mm' },
	{ slug: Filters.SIZE_WATCHES, name: '48mm', value: '48mm' },
	{ slug: Filters.SIZE_WATCHES, name: '50mm', value: '50mm' },
	{ slug: Filters.SIZE_WATCHES, name: '52mm', value: '52mm' },

	// PHONE SCREEN SIZES
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '3.5"', value: '3.5"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '4.0"', value: '4.0"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '4.5"', value: '4.5"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '5.0"', value: '5.0"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '5.2"', value: '5.2"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '5.5"', value: '5.5"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '5.7"', value: '5.7"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.0"', value: '6.0"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.1"', value: '6.1"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.2"', value: '6.2"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.3"', value: '6.3"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.4"', value: '6.4"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.5"', value: '6.5"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.6"', value: '6.6"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.7"', value: '6.7"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '6.8"', value: '6.8"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '7.0"', value: '7.0"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '7.2"', value: '7.2"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '7.6"', value: '7.6"' },
	{ slug: Filters.SIZE_PHONE_SCREEN, name: '8.0"', value: '8.0"' },

	// MONITOR SCREEN SIZES
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '15"', value: '15"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '17"', value: '17"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '19"', value: '19"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '20"', value: '20"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '21"', value: '21"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '21.5"', value: '21.5"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '22"', value: '22"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '23"', value: '23"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '23.6"', value: '23.6"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '24"', value: '24"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '25"', value: '25"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '27"', value: '27"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '28"', value: '28"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '29"', value: '29"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '30"', value: '30"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '32"', value: '32"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '34"', value: '34"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '35"', value: '35"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '37.5"', value: '37.5"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '38"', value: '38"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '40"', value: '40"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '42"', value: '42"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '43"', value: '43"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '49"', value: '49"' },
	{ slug: Filters.SIZE_MONITOR_SCREEN, name: '55"', value: '55"' },
];

export const SUBCATEGORIES_FILTERS = [
	{
		filterSlug: Filters.COLOR,
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
		filterSlug: Filters.MATERIAL_CLOTHING,
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
