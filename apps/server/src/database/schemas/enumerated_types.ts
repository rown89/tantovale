import { pgEnum } from 'drizzle-orm/pg-core';

import { Categories, Properties, Subcategories } from '../scripts/seeders/categories/constants';

import {
	chatMessageTypeValues,
	clothingSizeValues,
	colorValues,
	clothingMaterialValues,
	currencyValues,
	deliveryMethodValues,
	propertyTypeValues,
	itemImagesSizeValues,
	itemStatusValues,
	monitorScreenSizeValues,
	productConditionValues,
	orderProposalStatusValues,
	orderStatusValues,
	profileValues,
	sexValues,
	genderCategoryValues,
	phoneScreenSizeValues,
	watchWristSizeValues,
	shoeSizeValues,
} from './enumerated_values';

export const itemStatusEnum = pgEnum('status_enum', itemStatusValues);

export const ordersProposalStatusEnum = pgEnum('proposal_status_enum', orderProposalStatusValues);

export const orderStatusEnum = pgEnum('order_status_enum', orderStatusValues);

export const chatMessageTypeEnum = pgEnum('chat_message_type_enum', chatMessageTypeValues);

export const currencyEnum = pgEnum('transaction_currency_enum', currencyValues);

export const sexEnum = pgEnum('sex_enum', sexValues);
export const profileEnum = pgEnum('profile_types_enum', profileValues);

export const itemImagesSizeEnum = pgEnum('item_images_size_enum', itemImagesSizeValues);

export const deliveryMethodEnum = pgEnum('delivery_method_enum', deliveryMethodValues);

export const propertiesEnum = pgEnum('properties_enum', [
	Properties.CONDITION,
	Properties.DELIVERY_METHOD,
	Properties.GENDER,
	Properties.COLOR,
	Properties.MATERIAL_CLOTHING,
	Properties.SIZE_CLOTHING,
	Properties.SIZE_SHOES,
	Properties.SIZE_WATCHES,
	Properties.SIZE_PHONE_SCREEN,
	Properties.SIZE_MONITOR_SCREEN,
]);

export const propertyTypeEnum = pgEnum('property_types_enum', propertyTypeValues);

export const categoriesEnum = pgEnum('categories_enum', [
	Categories.ELECTRONICS,
	Categories.CLOTHINGS,
	Categories.KIDS,
	Categories.COLLECTABLES,
]);

export const SubcategoriesEnum = pgEnum('subcategories_enum', [
	Subcategories.COMPUTERS,
	Subcategories.DESKTOP_COMPUTER,
	Subcategories.LAPTOPS,
	Subcategories.PHONES,
	Subcategories.SMARTPHONES_CELLULARS,
	Subcategories.ACCESSORIES,
	Subcategories.PHOTOGRAPHY,
	Subcategories.TABLETS,
	Subcategories.DEVICES,
	Subcategories.SMARTWATCHES,
	Subcategories.E_READERS,
	Subcategories.CAMERAS,
	Subcategories.LENSES,
	Subcategories.SHOES,
	Subcategories.JEANS,
	Subcategories.PANTS,
	Subcategories.TOYS,
	Subcategories.BOOK_KIDS,
	Subcategories.CARDS,
	Subcategories.SINGLE_CARDS,
	Subcategories.CARD_DECKS,
	`${Subcategories.ACCESSORIES}_${Subcategories.PHONES}`,
	`${Subcategories.ACCESSORIES}_${Subcategories.PHOTOGRAPHY}`,
	`${Subcategories.ACCESSORIES}_${Subcategories.COMPUTERS}`,
	`${Subcategories.ACCESSORIES}_${Categories.CLOTHINGS}`,
	`${Subcategories.ACCESSORIES}_${Subcategories.DEVICES}`,
]);

export const PropertyValuesEnum = pgEnum('property_values_enum', [
	'null',
	// DELIVERY_METHODS
	...deliveryMethodValues,
	// CONDITIONS
	...productConditionValues,
	// GENDER
	...genderCategoryValues,
	// CLOTHING MATERIALS
	...clothingMaterialValues,
	// COLORS
	...colorValues,
	// CLOTH SIZES
	...clothingSizeValues,
	// SHOES SIZES
	...shoeSizeValues,
	// WATCH WIRST SIZES
	...watchWristSizeValues,
	// PHONE SIZE SCREENS
	...phoneScreenSizeValues,
	// MONITOR SIZE SCREENS
	...monitorScreenSizeValues,
]);
