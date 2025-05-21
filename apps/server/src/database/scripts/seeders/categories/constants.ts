import type { SubcategorySeeds, PropertySeed } from './types';
export interface PropertyValues {
	slug: string;
	value: string;
	name: string;
	icon?: string;
	meta?: Record<string, any>;
}

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
	COMPUTER_MONITORS: 'computer_monitors',
	COMPUTER_NETWORKING: 'computer_networking',
	COMPUTER_STORAGE: 'computer_storage',
	COMPUTER_SOUND: 'computer_sound',
	COMPUTER_MOUSE: 'computer_mouse',
	COMPUTER_KEYBOARDS: 'computer_keyboards',
	COMPUTER_PRINTERS: 'computer_printers',
	COMPUTER_SCANNERS: 'computer_scanners',
	PHONES: 'phones',
	SMARTPHONES_CELLULARS: 'smartphones_cellulares',
	TABLETS: 'tablets',
	DEVICES: 'devices',
	SMARTWATCHES: 'smartwatches',
	E_READERS: 'e_readers',
	ACCESSORIES: 'accessories',
	PHOTOGRAPHY: 'photography',
	CAMERAS: 'cameras',
	LENSES: 'lenses',
	DRONES: 'drones',
	SHOES: 'shoes',
	JEANS: 'jeans',
	PANTS: 'pants',
	SUITS: 'suits',
	SPORTWEAR: 'sportswear',
	SWIMWEAR: 'swimwear',
	KIDS: 'kids',
	TOYS: 'toys',
	CARDS: 'cards',
	BOOK_KIDS: 'book_kids',
	SINGLE_CARDS: 'single_cards',
	CARD_DECKS: 'card_decks',
} as const;

export type SubcategoryTypes = (typeof Subcategories)[keyof typeof Subcategories];

export const SUBCATEGORY_SEEDS: SubcategorySeeds = {
	electronics: [
		{
			parent: { name: 'Computers', slug: Subcategories.COMPUTERS },
			children: [
				{ name: 'Desktops', slug: Subcategories.DESKTOP_COMPUTER, easy_pay: true, menu_order: 1 },
				{ name: 'Laptops', slug: Subcategories.LAPTOPS, easy_pay: true, menu_order: 2 },
				{ name: 'Monitors', slug: Subcategories.COMPUTER_MONITORS, easy_pay: true, menu_order: 3 },
				{ name: 'Mouse', slug: Subcategories.COMPUTER_MOUSE, easy_pay: true, menu_order: 4 },
				{ name: 'Keyboards', slug: Subcategories.COMPUTER_KEYBOARDS, easy_pay: true, menu_order: 5 },
				{ name: 'Printers', slug: Subcategories.COMPUTER_PRINTERS, easy_pay: true, menu_order: 6 },
				{ name: 'Scanners', slug: Subcategories.COMPUTER_SCANNERS, easy_pay: true, menu_order: 7 },
				{ name: 'Networking', slug: Subcategories.COMPUTER_NETWORKING, easy_pay: true, menu_order: 8 },
				{ name: 'Storage', slug: Subcategories.COMPUTER_STORAGE, easy_pay: true, menu_order: 9 },
				{ name: 'Sound', slug: Subcategories.COMPUTER_SOUND, easy_pay: true, menu_order: 10 },
			],
		},
		{
			parent: { name: 'Phones', slug: Subcategories.PHONES },
			children: [
				{
					name: 'Smartphones & Cellulars',
					slug: Subcategories.SMARTPHONES_CELLULARS,
					easy_pay: true,
					menu_order: 1,
				},
				{ name: 'Phone Accessories', slug: Subcategories.ACCESSORIES, easy_pay: true, menu_order: 2 },
			],
		},
		{
			parent: { name: 'Devices', slug: Subcategories.DEVICES },
			children: [
				{
					name: 'Tablets',
					slug: Subcategories.TABLETS,
					easy_pay: true,
					menu_order: 1,
				},
				{ name: 'Smartwatches', slug: Subcategories.SMARTWATCHES, easy_pay: true, menu_order: 2 },
				{ name: 'E-Readers', slug: Subcategories.E_READERS, easy_pay: true, menu_order: 3 },
				{ name: 'Devices Accessories', slug: Subcategories.ACCESSORIES, easy_pay: true, menu_order: 4 },
			],
		},
		{
			parent: { name: 'Photography', slug: Subcategories.PHOTOGRAPHY },
			children: [
				{ name: 'Cameras', slug: Subcategories.CAMERAS, easy_pay: true, menu_order: 1 },
				{ name: 'Lenses', slug: Subcategories.LENSES, easy_pay: true, menu_order: 2 },
				{ name: 'Drones', slug: Subcategories.DRONES, easy_pay: true, menu_order: 3 },
				{ name: 'Photography Accessories', slug: Subcategories.ACCESSORIES, easy_pay: true, menu_order: 4 },
			],
		},
	],
	clothings: [
		{ name: 'Shoes', slug: Subcategories.SHOES, easy_pay: true, menu_order: 1 },
		{ name: 'Jeans', slug: Subcategories.JEANS, easy_pay: true, menu_order: 2 },
		{ name: 'Pants', slug: Subcategories.PANTS, easy_pay: true, menu_order: 3 },
		{ name: 'Suits', slug: Subcategories.SUITS, easy_pay: true, menu_order: 4 },
		{ name: 'Sportswear', slug: Subcategories.SPORTWEAR, easy_pay: true, menu_order: 5 },
		{ name: 'Swimwear', slug: Subcategories.SWIMWEAR, easy_pay: true, menu_order: 6 },
		{ name: 'Clothing Accessories', slug: Subcategories.ACCESSORIES, easy_pay: true, menu_order: 7 },
	],
	kids: [
		{ name: 'Toys', slug: Subcategories.TOYS, easy_pay: true, menu_order: 1 },
		{ name: 'Books', slug: Subcategories.BOOK_KIDS, easy_pay: true, menu_order: 2 },
	],
	collectables: [
		{
			parent: { name: 'Cards', slug: Subcategories.CARDS },
			children: [
				{ name: 'Single Cards', slug: Subcategories.SINGLE_CARDS, easy_pay: true, menu_order: 1 },
				{ name: 'Card Decks', slug: Subcategories.CARD_DECKS, easy_pay: true, menu_order: 2 },
			],
		},
	],
};

export const Properties = {
	CONDITION: 'condition',
	GENDER: 'gender',
	COLOR: 'color',
	MATERIAL_CLOTHING: 'material_clothing',
	SIZE_CLOTHING: 'size_clothing',
	SIZE_SHOES: 'size_shoes',
	SIZE_WATCHES: 'size_watches',
	SIZE_PHONE_SCREEN: 'size_phone_screen',
	SIZE_TABLET_SCREEN: 'size_tablet_screen',
	SIZE_MONITOR_SCREEN: 'size_monitor_screen',
	DELIVERY_METHOD: 'delivery_method',
} as const;

export type PropertiesTypes = (typeof Properties)[keyof typeof Properties];

export const PropertyTypes = {
	SELECT: 'select',
	SELECT_MULTI: 'select_multi',
	BOOLEAN: 'boolean',
	CHECKBOX: 'checkbox',
	RADIO: 'radio',
	NUMBER: 'number',
	RANGE: 'range',
} as const;

export const PROPERTY_SEEDS: PropertySeed[] = [
	// Generic
	{ name: 'Condition', slug: Properties.CONDITION, type: PropertyTypes.SELECT },
	{ name: 'Delivery Methods', slug: Properties.DELIVERY_METHOD, type: PropertyTypes.SELECT },
	{ name: 'Gender', slug: Properties.GENDER, type: PropertyTypes.RADIO },
	{ name: 'Color', slug: Properties.COLOR, type: PropertyTypes.SELECT_MULTI },
	// Clothing
	{
		name: 'Clothing sizes',
		slug: Properties.SIZE_CLOTHING,
		type: PropertyTypes.SELECT,
	},
	{
		name: 'Shoes sizes',
		slug: Properties.SIZE_SHOES,
		type: PropertyTypes.SELECT,
	},
	{
		name: 'Watches size',
		slug: Properties.SIZE_WATCHES,
		type: PropertyTypes.SELECT,
	},
	{
		name: 'Clothing Materials',
		slug: Properties.MATERIAL_CLOTHING,
		type: PropertyTypes.SELECT_MULTI,
	},
	// Phone
	{
		name: 'Phone Screen Sizes',
		slug: Properties.SIZE_PHONE_SCREEN,
		type: PropertyTypes.SELECT,
	},
	{
		name: 'Monitor Screen Sizes',
		slug: Properties.SIZE_MONITOR_SCREEN,
		type: PropertyTypes.SELECT,
	},
];

export const PROPERTY_VALUES: PropertyValues[] = [
	// CONDITIONS
	{ slug: Properties.CONDITION, name: 'New', value: 'new' },
	{ slug: Properties.CONDITION, name: 'Used - Good', value: 'used-good' },
	{ slug: Properties.CONDITION, name: 'Used - Fair', value: 'used-fair' },
	{ slug: Properties.CONDITION, name: 'Used - Damaged', value: 'used-damaged' },

	// DELIVERY METHOD
	{ slug: Properties.DELIVERY_METHOD, name: 'Pickup', value: 'pickup' },
	{ slug: Properties.DELIVERY_METHOD, name: 'Shipping', value: 'shipping' },
	{ slug: Properties.DELIVERY_METHOD, name: 'Shipping Easy Pay', value: 'shipping_easy_pay' },

	// GENDER
	{ slug: Properties.GENDER, name: 'Unisex', value: 'unisex' },
	{ slug: Properties.GENDER, name: 'Men', value: 'men' },
	{ slug: Properties.GENDER, name: 'Women', value: 'women' },

	// CLOTHING MATERIALS
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Leather', value: 'leather' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Cotton', value: 'cotton' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Wool', value: 'wool' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Silk', value: 'silk' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Linen', value: 'linen' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Polyester', value: 'polyester' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Nylon', value: 'nylon' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Rayon', value: 'rayon' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Spandex', value: 'spandex' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Acrylic', value: 'acrylic' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Viscose', value: 'viscose' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Denim', value: 'denim' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Suede', value: 'suede' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Velvet', value: 'velvet' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Cashmere', value: 'cashmere' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Corduroy', value: 'corduroy' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Tweed', value: 'tweed' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Flannel', value: 'flannel' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Canvas', value: 'canvas' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Hemp', value: 'hemp' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Bamboo', value: 'bamboo' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Fleece', value: 'fleece' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Microfiber', value: 'microfiber' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Modal', value: 'modal' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Jacquard', value: 'jacquard' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Chiffon', value: 'chiffon' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Taffeta', value: 'taffeta' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Satin', value: 'satin' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Gabardine', value: 'gabardine' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Terrycloth', value: 'terrycloth' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Seersucker', value: 'seersucker' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Batiste', value: 'batiste' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Muslin', value: 'muslin' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Organza', value: 'organza' },
	{ slug: Properties.MATERIAL_CLOTHING, name: 'Tulle', value: 'tulle' },

	// COLORS
	{ slug: Properties.COLOR, name: 'Black', value: 'black' },
	{ slug: Properties.COLOR, name: 'White', value: 'white' },
	{ slug: Properties.COLOR, name: 'Red', value: 'red' },
	{ slug: Properties.COLOR, name: 'Blue', value: 'blue' },
	{ slug: Properties.COLOR, name: 'Yellow', value: 'yellow' },
	{ slug: Properties.COLOR, name: 'Green', value: 'green' },
	{ slug: Properties.COLOR, name: 'Orange', value: 'orange' },
	{ slug: Properties.COLOR, name: 'Purple', value: 'purple' },
	{ slug: Properties.COLOR, name: 'Pink', value: 'pink' },
	{ slug: Properties.COLOR, name: 'Brown', value: 'brown' },
	{ slug: Properties.COLOR, name: 'Gray', value: 'gray' },
	{ slug: Properties.COLOR, name: 'Beige', value: 'beige' },
	{ slug: Properties.COLOR, name: 'Cyan', value: 'cyan' },
	{ slug: Properties.COLOR, name: 'Magenta', value: 'magenta' },
	{ slug: Properties.COLOR, name: 'Lime', value: 'lime' },
	{ slug: Properties.COLOR, name: 'Olive', value: 'olive' },
	{ slug: Properties.COLOR, name: 'Navy', value: 'navy' },
	{ slug: Properties.COLOR, name: 'Teal', value: 'teal' },
	{ slug: Properties.COLOR, name: 'Maroon', value: 'maroon' },
	{ slug: Properties.COLOR, name: 'Turquoise', value: 'turquoise' },
	{ slug: Properties.COLOR, name: 'Gold', value: 'gold' },
	{ slug: Properties.COLOR, name: 'Silver', value: 'silver' },
	{ slug: Properties.COLOR, name: 'Bronze', value: 'bronze' },
	{ slug: Properties.COLOR, name: 'Ivory', value: 'ivory' },
	{ slug: Properties.COLOR, name: 'Mustard', value: 'mustard' },
	{ slug: Properties.COLOR, name: 'Coral', value: 'coral' },
	{ slug: Properties.COLOR, name: 'Salmon', value: 'salmon' },
	{ slug: Properties.COLOR, name: 'Peach', value: 'peach' },
	{ slug: Properties.COLOR, name: 'Lavender', value: 'lavender' },
	{ slug: Properties.COLOR, name: 'Charcoal', value: 'charcoal' },
	{ slug: Properties.COLOR, name: 'Indigo', value: 'indigo' },
	{ slug: Properties.COLOR, name: 'Periwinkle', value: 'periwinkle' },
	{ slug: Properties.COLOR, name: 'Burgundy', value: 'burgundy' },
	{ slug: Properties.COLOR, name: 'Mint', value: 'mint' },
	{ slug: Properties.COLOR, name: 'Ochre', value: 'ochre' },
	{ slug: Properties.COLOR, name: 'Plum', value: 'plum' },
	{ slug: Properties.COLOR, name: 'Rust', value: 'rust' },
	{ slug: Properties.COLOR, name: 'Saffron', value: 'saffron' },
	{ slug: Properties.COLOR, name: 'Jade', value: 'jade' },
	{ slug: Properties.COLOR, name: 'Violet', value: 'violet' },

	// CLOTH SIZES
	{ slug: Properties.SIZE_CLOTHING, name: 'S', value: 's' },
	{ slug: Properties.SIZE_CLOTHING, name: 'M', value: 'm' },
	{ slug: Properties.SIZE_CLOTHING, name: 'L', value: 'l' },
	{ slug: Properties.SIZE_CLOTHING, name: 'XL', value: 'xl' },
	{ slug: Properties.SIZE_CLOTHING, name: 'XXL', value: 'xxl' },
	{ slug: Properties.SIZE_CLOTHING, name: 'XXXL', value: 'xxxl' },

	// SHOE SIZES
	{ slug: Properties.SIZE_SHOES, name: '35', value: '35' },
	{ slug: Properties.SIZE_SHOES, name: '35.5', value: '35.5' },
	{ slug: Properties.SIZE_SHOES, name: '36', value: '36' },
	{ slug: Properties.SIZE_SHOES, name: '36.5', value: '36.5' },
	{ slug: Properties.SIZE_SHOES, name: '37', value: '37' },
	{ slug: Properties.SIZE_SHOES, name: '37.5', value: '37.5' },
	{ slug: Properties.SIZE_SHOES, name: '38', value: '38' },
	{ slug: Properties.SIZE_SHOES, name: '38.5', value: '38.5' },
	{ slug: Properties.SIZE_SHOES, name: '39', value: '39' },
	{ slug: Properties.SIZE_SHOES, name: '39.5', value: '39.5' },
	{ slug: Properties.SIZE_SHOES, name: '40', value: '40' },
	{ slug: Properties.SIZE_SHOES, name: '40.5', value: '40.5' },
	{ slug: Properties.SIZE_SHOES, name: '41', value: '41' },
	{ slug: Properties.SIZE_SHOES, name: '41.5', value: '41.5' },
	{ slug: Properties.SIZE_SHOES, name: '42', value: '42' },
	{ slug: Properties.SIZE_SHOES, name: '42.5', value: '42.5' },
	{ slug: Properties.SIZE_SHOES, name: '43', value: '43' },
	{ slug: Properties.SIZE_SHOES, name: '43.5', value: '43.5' },
	{ slug: Properties.SIZE_SHOES, name: '44', value: '44' },
	{ slug: Properties.SIZE_SHOES, name: '44.5', value: '44.5' },
	{ slug: Properties.SIZE_SHOES, name: '45', value: '45' },
	{ slug: Properties.SIZE_SHOES, name: '45.5', value: '45.5' },
	{ slug: Properties.SIZE_SHOES, name: '46', value: '46' },
	{ slug: Properties.SIZE_SHOES, name: '46.5', value: '46.5' },
	{ slug: Properties.SIZE_SHOES, name: '47', value: '47' },
	{ slug: Properties.SIZE_SHOES, name: '47.5', value: '47.5' },
	{ slug: Properties.SIZE_SHOES, name: '48', value: '48' },
	{ slug: Properties.SIZE_SHOES, name: '48.5', value: '48.5' },
	{ slug: Properties.SIZE_SHOES, name: '49', value: '49' },
	{ slug: Properties.SIZE_SHOES, name: '49.5', value: '49.5' },
	{ slug: Properties.SIZE_SHOES, name: '50', value: '50' },

	// WATCH WRIST SIZES
	{ slug: Properties.SIZE_WATCHES, name: '28mm', value: '28mm' },
	{ slug: Properties.SIZE_WATCHES, name: '30mm', value: '30mm' },
	{ slug: Properties.SIZE_WATCHES, name: '32mm', value: '32mm' },
	{ slug: Properties.SIZE_WATCHES, name: '34mm', value: '34mm' },
	{ slug: Properties.SIZE_WATCHES, name: '36mm', value: '36mm' },
	{ slug: Properties.SIZE_WATCHES, name: '38mm', value: '38mm' },
	{ slug: Properties.SIZE_WATCHES, name: '40mm', value: '40mm' },
	{ slug: Properties.SIZE_WATCHES, name: '41mm', value: '41mm' },
	{ slug: Properties.SIZE_WATCHES, name: '42mm', value: '42mm' },
	{ slug: Properties.SIZE_WATCHES, name: '43mm', value: '43mm' },
	{ slug: Properties.SIZE_WATCHES, name: '44mm', value: '44mm' },
	{ slug: Properties.SIZE_WATCHES, name: '45mm', value: '45mm' },
	{ slug: Properties.SIZE_WATCHES, name: '46mm', value: '46mm' },
	{ slug: Properties.SIZE_WATCHES, name: '47mm', value: '47mm' },
	{ slug: Properties.SIZE_WATCHES, name: '48mm', value: '48mm' },
	{ slug: Properties.SIZE_WATCHES, name: '50mm', value: '50mm' },
	{ slug: Properties.SIZE_WATCHES, name: '52mm', value: '52mm' },

	// PHONE SCREEN SIZES
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '3.5"', value: '3.5"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '4.0"', value: '4.0"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '4.5"', value: '4.5"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '5.0"', value: '5.0"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '5.2"', value: '5.2"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '5.5"', value: '5.5"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '5.7"', value: '5.7"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.0"', value: '6.0"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.1"', value: '6.1"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.2"', value: '6.2"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.3"', value: '6.3"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.4"', value: '6.4"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.5"', value: '6.5"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.6"', value: '6.6"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.7"', value: '6.7"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '6.8"', value: '6.8"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '7.0"', value: '7.0"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '7.2"', value: '7.2"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '7.6"', value: '7.6"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '8.0"', value: '8.0"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '8.2"', value: '8.2"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '8.4"', value: '8.4"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '8.6"', value: '8.6"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '8.8"', value: '8.8"' },
	{ slug: Properties.SIZE_PHONE_SCREEN, name: '9.0"', value: '9.0"' },

	// TABLET SCREEN SIZES
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '7.9"', value: '7.9"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '8.3"', value: '8.3"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '8.9"', value: '8.9"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '9.7"', value: '9.7"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '10.1"', value: '10.1"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '10.2"', value: '10.2"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '10.5"', value: '10.5"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '11"', value: '11"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '12.9"', value: '12.9"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '13"', value: '13"' },
	{ slug: Properties.SIZE_TABLET_SCREEN, name: '14"', value: '14"' },

	// MONITOR SCREEN SIZES
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '15"', value: '15"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '17"', value: '17"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '19"', value: '19"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '20"', value: '20"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '21"', value: '21"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '21.5"', value: '21.5"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '22"', value: '22"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '23"', value: '23"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '23.6"', value: '23.6"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '24"', value: '24"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '25"', value: '25"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '27"', value: '27"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '28"', value: '28"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '29"', value: '29"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '30"', value: '30"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '32"', value: '32"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '34"', value: '34"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '35"', value: '35"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '37.5"', value: '37.5"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '38"', value: '38"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '40"', value: '40"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '42"', value: '42"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '43"', value: '43"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '49"', value: '49"' },
	{ slug: Properties.SIZE_MONITOR_SCREEN, name: '55"', value: '55"' },
];

export const SUBCATEGORIES_PROPERTIES = [
	{
		propertySlug: Properties.COLOR,
		subcategories: [
			{
				slug: Subcategories.PANTS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.JEANS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.SHOES,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
	{
		propertySlug: Properties.MATERIAL_CLOTHING,
		subcategories: [
			{
				slug: Subcategories.PANTS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.JEANS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.SHOES,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
	{
		propertySlug: Properties.GENDER,
		subcategories: [
			{
				slug: Subcategories.PANTS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.JEANS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.SHOES,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
	{
		propertySlug: Properties.SIZE_CLOTHING,
		subcategories: [
			{
				slug: Subcategories.PANTS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.JEANS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
	{
		propertySlug: Properties.SIZE_SHOES,
		subcategories: [
			{
				slug: Subcategories.SHOES,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
	{
		propertySlug: Properties.SIZE_PHONE_SCREEN,
		subcategories: [
			{
				slug: Subcategories.PHONES,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
	{
		propertySlug: Properties.SIZE_TABLET_SCREEN,
		subcategories: [
			{
				slug: Subcategories.TABLETS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
	{
		propertySlug: Properties.SIZE_MONITOR_SCREEN,
		subcategories: [
			{
				slug: Subcategories.LAPTOPS,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
			{
				slug: Subcategories.DESKTOP_COMPUTER,
				on_item_create_required: true,
				on_item_update_editable: true,
				searchable: true,
			},
		],
	},
];
