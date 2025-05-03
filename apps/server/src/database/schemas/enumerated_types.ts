import { pgEnum } from 'drizzle-orm/pg-core';

import { Categories, Filters, Subcategories } from '../scripts/seeders/categories/constants';
import {
	DeliveryMethodValues,
	ProductConditionValues,
	GenderCategoryValues,
	ClothingMaterialValues,
	ColorValues,
	ClothingSizeValues,
	ShoeSizeValues,
	WatchWristSizeValues,
	PhoneScreenSizeValues,
	MonitorScreenSizeValues,
} from '../scripts/seeders/categories/types';
import {
	chatMessageTypeValues,
	currencyValues,
	filterTypeValues,
	itemImagesSizeValues,
	itemStatusValues,
	orderProposalStatusValues,
	orderStatusValues,
	profileValues,
	sexValues,
	transactionStatusValues,
} from './enumerated_values';

export const itemStatusEnum = pgEnum('status_enum', itemStatusValues);

export const ordersProposalStatusEnum = pgEnum('proposal_status_enum', orderProposalStatusValues);

export const orderStatusEnum = pgEnum('order_status_enum', orderStatusValues);

export const transactionsStatusEnum = pgEnum('transaction_status_enum', transactionStatusValues);

export const chatMessageTypeEnum = pgEnum('chat_message_type_enum', chatMessageTypeValues);

export const currencyEnum = pgEnum('transaction_currency_enum', currencyValues);

export const sexEnum = pgEnum('sex_enum', sexValues);
export const profileEnum = pgEnum('profile_types_enum', profileValues);

export const itemImagesSizeEnum = pgEnum('item_images_size_enum', itemImagesSizeValues);

export const filtersEnum = pgEnum('filters_enum', [
	Filters.CONDITION,
	Filters.DELIVERY_METHOD,
	Filters.GENDER,
	Filters.COLOR,
	Filters.MATERIAL_CLOTHING,
	Filters.SIZE_CLOTHING,
	Filters.SIZE_SHOES,
	Filters.SIZE_WATCHES,
	Filters.SIZE_PHONE_SCREEN,
	Filters.SIZE_MONITOR_SCREEN,
]);

export const filterTypeEnum = pgEnum('filter_types_enum', filterTypeValues);

export const categoriesEnum = pgEnum('categories_enum', [
	Categories.ELECTRONICS,
	Categories.CLOTHINGS,
	Categories.KIDS,
	Categories.COLLECTABLES,
]);

export const SubcategoriesEnum = pgEnum('subcategories_enum', [
	Subcategories.COMPUTERS,
	Subcategories.DESKTOP_COMPUTER,
	Subcategories.PHONES,
	Subcategories.SMARTPHONES_CELLULARS,
	Subcategories.ACCESSORIES,
	Subcategories.PHOTOGRAPHY,
	Subcategories.LAPTOPS,
	Subcategories.CAMERAS,
	Subcategories.LENSES,
	Subcategories.SHOES,
	Subcategories.JEANS,
	Subcategories.PANTS,
	Subcategories.TOYS,
	Subcategories.BOOK_KIDS,
	Subcategories.CARDS,
	Subcategories.SINGLE_CARDS,
	Subcategories.UNCUT_PAPER_SHEET,
	`${Subcategories.ACCESSORIES}_${Subcategories.PHONES}`,
	`${Subcategories.ACCESSORIES}_${Subcategories.PHOTOGRAPHY}`,
	`${Subcategories.ACCESSORIES}_${Subcategories.COMPUTERS}`,
	`${Subcategories.ACCESSORIES}_${Categories.CLOTHINGS}`,
]);

export const FilterValuesEnum = pgEnum('filter_values_enum', [
	'null',
	// DELIVERY_METHODS
	...DeliveryMethodValues,
	// CONDITIONS
	...ProductConditionValues,
	// GENDER
	...GenderCategoryValues,
	// CLOTHING MATERIALS
	...ClothingMaterialValues,
	// COLORS
	...ColorValues,
	// CLOTH SIZES
	...ClothingSizeValues,
	// SHOES SIZES
	...ShoeSizeValues,
	// WATCH WIRST SIZES
	...WatchWristSizeValues,
	// PHONE SIZE SCREENS
	...PhoneScreenSizeValues,
	// MONITOR SIZE SCREENS
	...MonitorScreenSizeValues,
]);
