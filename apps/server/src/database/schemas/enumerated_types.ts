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

export const statusEnum = pgEnum('status_enum', ['available', 'sold']);
export const sexEnum = pgEnum('sex_enum', ['male', 'female']);
export const profileEnum = pgEnum('profile_types_enum', ['private', 'private_pro', 'shop', 'shop_pro']);

export const itemImagesSizeEnum = pgEnum('item_images_size_enum', ['original', 'small', 'medium', 'thumbnail']);

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

export const filterTypeEnum = pgEnum('filter_types_enum', [
	'select',
	'select_multi',
	'boolean',
	'checkbox',
	'radio',
	'number',
]);

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
