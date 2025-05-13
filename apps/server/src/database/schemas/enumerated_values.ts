export const chatMessageTypeValues = ['text', 'proposal'] as const;
export type ChatMessageType = (typeof chatMessageTypeValues)[number];

export const orderProposalStatusValues = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type OrderProposalStatus = (typeof orderProposalStatusValues)[number];

export const orderStatusValues = ['pending_payment', 'payment_confirmed', 'completed', 'cancelled', 'expired'] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

export const currencyValues = [
	'usd',
	'eur',
	'gbp',
	'cad',
	'aud',
	'jpy',
	'cny',
	'inr',
	'brl',
	'ars',
	'clp',
	'cop',
	'mxn',
	'pen',
	'pyg',
	'uyu',
	'vef',
	'vnd',
	'zar',
] as const;
export type Currency = (typeof currencyValues)[number];

export const profileValues = ['private', 'private_pro', 'shop', 'shop_pro'] as const;
export type Profile = (typeof profileValues)[number];

export const itemImagesSizeValues = ['original', 'small', 'medium', 'thumbnail'] as const;
export type ItemImagesSize = (typeof itemImagesSizeValues)[number];

export const propertyTypeValues = ['select', 'select_multi', 'boolean', 'checkbox', 'radio', 'number'] as const;
export type PropertyType = (typeof propertyTypeValues)[number];

export const itemStatusValues = ['available', 'sold', 'pending', 'archived'] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const itemConditionValues = ['new', 'used-like-new', 'used-good', 'used-fair'] as const;
export type ItemCondition = (typeof itemConditionValues)[number];

export const deliveryMethodValues = ['shipping', 'pickup'] as const;
export type DeliveryMethod = (typeof deliveryMethodValues)[number];

export const productConditionValues = ['new', 'used-like-new', 'used-good', 'used-fair'] as const;
export type ProductCondition = (typeof productConditionValues)[number];

export const sexValues = ['male', 'female'] as const;
export type Sex = (typeof sexValues)[number];

// Gender Categories
export const genderCategoryValues = ['unisex', 'men', 'women'] as const;
export type GenderCategory = (typeof genderCategoryValues)[number];

// Clothing Materials
export const clothingMaterialValues = [
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
export type ClothingMaterial = (typeof clothingMaterialValues)[number];

// Colors
export const colorValues = [
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
export type Color = (typeof colorValues)[number];

// Clothing Sizes
export const clothingSizeValues = ['s', 'm', 'l', 'xl', 'xxl', 'xxxl'] as const;
type ClothingSize = (typeof clothingSizeValues)[number];

// Shoe Sizes
export const shoeSizeValues = [
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
export type ShoeSize = (typeof shoeSizeValues)[number];

// Watch Wrist Sizes
export const watchWristSizeValues = [
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
export type WatchWristSize = (typeof watchWristSizeValues)[number];

// Phone Screen Sizes
export const phoneScreenSizeValues = [
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
export type PhoneScreenSize = (typeof phoneScreenSizeValues)[number];

// Monitor Screen Sizes
export const monitorScreenSizeValues = [
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
export type MonitorScreenSize = (typeof monitorScreenSizeValues)[number];

type PropertyKeyValues =
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

export interface PropertyValues {
	slug: string;
	value: PropertyKeyValues;
	name: string;
	icon?: string;
	meta?: Record<string, any>;
}
