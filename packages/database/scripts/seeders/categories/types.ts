export interface BaseSubcategorySeed {
	name: string;
	slug: string;
}

export interface ParentGroupSeed {
	parent: BaseSubcategorySeed;
	children: BaseSubcategorySeed[];
}

export interface SubcategorySeeds {
	electronics: (BaseSubcategorySeed | ParentGroupSeed)[];
	clothings: (BaseSubcategorySeed | ParentGroupSeed)[];
	kids: (BaseSubcategorySeed | ParentGroupSeed)[];
	collectables: (BaseSubcategorySeed | ParentGroupSeed)[];
}

export interface FilterSeed extends BaseSubcategorySeed {
	type: 'select' | 'select_multi' | 'boolean' | 'checkbox' | 'radio';
}

// Delivery Methods
export const DeliveryMethodValues = ['shipping', 'pickup'] as const;
export type DeliveryMethod = (typeof DeliveryMethodValues)[number];

// Product Conditions
export const ProductConditionValues = ['new', 'used-like-new', 'used-good', 'used-fair'] as const;
export type ProductCondition = (typeof ProductConditionValues)[number];

// Gender Categories
export const GenderCategoryValues = ['unisex', 'men', 'women'] as const;
export type GenderCategory = (typeof GenderCategoryValues)[number];

// Clothing Materials
export const ClothingMaterialValues = [
	'leather',
	'cotton',
	'wool',
	'silk',
	'linen',
	'polyester',
	'nylon',
	'rayon',
	'spandex',
	'acrylic',
	'viscose',
	'denim',
	'suede',
	'velvet',
	'cashmere',
	'corduroy',
	'tweed',
	'flannel',
	'canvas',
	'hemp',
	'bamboo',
	'fleece',
	'microfiber',
	'modal',
	'jacquard',
	'chiffon',
	'taffeta',
	'satin',
	'gabardine',
	'terrycloth',
	'seersucker',
	'batiste',
	'muslin',
	'organza',
	'tulle',
] as const;
export type ClothingMaterial = (typeof ClothingMaterialValues)[number];

// Colors
export const ColorValues = [
	'black',
	'white',
	'red',
	'blue',
	'yellow',
	'green',
	'orange',
	'purple',
	'pink',
	'brown',
	'gray',
	'beige',
	'cyan',
	'magenta',
	'lime',
	'olive',
	'navy',
	'teal',
	'maroon',
	'turquoise',
	'gold',
	'silver',
	'bronze',
	'ivory',
	'mustard',
	'coral',
	'salmon',
	'peach',
	'lavender',
	'charcoal',
	'indigo',
	'periwinkle',
	'burgundy',
	'mint',
	'ochre',
	'plum',
	'rust',
	'saffron',
	'jade',
	'violet',
] as const;
export type Color = (typeof ColorValues)[number];

// Clothing Sizes
export const ClothingSizeValues = ['s', 'm', 'l', 'xl', 'xxl', 'xxxl'] as const;
type ClothingSize = (typeof ClothingSizeValues)[number];

// Shoe Sizes
export const ShoeSizeValues = [
	'35',
	'35.5',
	'36',
	'36.5',
	'37',
	'37.5',
	'38',
	'38.5',
	'39',
	'39.5',
	'40',
	'40.5',
	'41',
	'41.5',
	'42',
	'42.5',
	'43',
	'43.5',
	'44',
	'44.5',
	'45',
	'45.5',
	'46',
	'46.5',
	'47',
	'47.5',
	'48',
	'48.5',
	'49',
	'49.5',
	'50',
] as const;
export type ShoeSize = (typeof ShoeSizeValues)[number];

// Watch Wrist Sizes
export const WatchWristSizeValues = [
	'28mm',
	'30mm',
	'32mm',
	'34mm',
	'36mm',
	'38mm',
	'40mm',
	'41mm',
	'42mm',
	'43mm',
	'44mm',
	'45mm',
	'46mm',
	'47mm',
	'48mm',
	'50mm',
	'52mm',
] as const;
export type WatchWristSize = (typeof WatchWristSizeValues)[number];

// Phone Screen Sizes
export const PhoneScreenSizeValues = [
	'3.5"',
	'4.0"',
	'4.5"',
	'5.0"',
	'5.2"',
	'5.5"',
	'5.7"',
	'6.0"',
	'6.1"',
	'6.2"',
	'6.3"',
	'6.4"',
	'6.5"',
	'6.6"',
	'6.7"',
	'6.8"',
	'7.0"',
	'7.2"',
	'7.6"',
	'8.0"',
] as const;
export type PhoneScreenSize = (typeof PhoneScreenSizeValues)[number];

// Monitor Screen Sizes
export const MonitorScreenSizeValues = [
	'15"',
	'17"',
	'19"',
	'20"',
	'21"',
	'21.5"',
	'22"',
	'23"',
	'23.6"',
	'24"',
	'25"',
	'27"',
	'28"',
	'29"',
	'30"',
	'32"',
	'34"',
	'35"',
	'37.5"',
	'38"',
	'40"',
	'42"',
	'43"',
	'49"',
	'55"',
] as const;
export type MonitorScreenSize = (typeof MonitorScreenSizeValues)[number];

type FilterKeyValues =
	| 'null'
	| DeliveryMethod
	| ProductCondition
	| GenderCategory
	| ClothingMaterial
	| Color
	| ClothingSize
	| ShoeSize
	| WatchWristSize
	| PhoneScreenSize
	| MonitorScreenSize;

export interface FilterValues {
	slug: string;
	value: FilterKeyValues;
	name: string;
	icon?: string;
	meta?: Record<string, any>;
}
