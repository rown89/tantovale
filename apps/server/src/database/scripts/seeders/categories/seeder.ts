import { count, eq } from 'drizzle-orm';
import { createClient, type DrizzleClient } from '../../..';

import {
	categories,
	subcategories,
	properties,
	subcategory_properties,
	property_values,
} from '../../../schemas/schema';

import {
	CATEGORY_SEEDS,
	SUBCATEGORY_SEEDS,
	PROPERTY_SEEDS,
	Categories,
	Subcategories,
	PROPERTY_VALUES,
	Properties,
	SUBCATEGORIES_PROPERTIES,
} from './constants';

import type { SelectSubCategories } from '../../../schemas/subcategories';
import type { BaseSubcategorySeed, ChildSubcategory, ParentGroupSeed } from './types';

// Type guard to check if an item is a ParentGroupSeed
function isParentGroupSeed(item: BaseSubcategorySeed | ParentGroupSeed): item is ParentGroupSeed {
	return 'parent' in item && 'children' in item;
}

export const seedDatabase = async (): Promise<void> => {
	console.log('🌱 Starting database seeding...');

	const { db, client } = createClient();

	try {
		// Begin transaction
		await client.query('BEGIN');

		// Seed categories and store result in a map for easier access
		const categoryMap = await seedCategories(db);

		// Seed subcategories using the category map
		const subcategoryMap = await seedSubcategories(db, categoryMap);

		// Seed properties
		const propertyMap = await seedProperties(db);

		await seedPropertyValues(db, propertyMap);

		// Link properties to subcategories
		await linkPropertiesToSubcategories(db, subcategoryMap, propertyMap);

		// Run a verification query to show the results
		await verifySeeding(db);

		// Commit the transaction
		await client.query('COMMIT');
		console.log('🌱 Seeding completed successfully!');
	} catch (error) {
		console.error('❌ Seeding failed:', error);
		await client.query('ROLLBACK');
		throw error;
	} finally {
		await client.end();
	}
};

/**
 * Seeds categories table and returns a map of slug to id
 */
async function seedCategories(db: DrizzleClient['db']) {
	const insertedCategories = await db.insert(categories).values(CATEGORY_SEEDS).onConflictDoNothing().returning();

	console.log(`✅ Categories Inserted: ${insertedCategories.length}`);

	// Create a map for easier lookup by slug
	return insertedCategories.reduce(
		(map, category) => {
			map[category.slug] = category.id;
			return map;
		},
		{} as Record<string, number>,
	);
}

/**
 * Seeds subcategories table with proper hierarchy
 */
async function seedSubcategories(
	db: DrizzleClient['db'],
	categoryMap: Record<string, number>,
): Promise<Record<string, number>> {
	const subcategoryMap: Record<string, number> = {};

	// 1. Electronics
	const electronicSubcategories = await seedElectronicSubcategories(db, categoryMap);
	electronicSubcategories.forEach((sub) => {
		subcategoryMap[sub.slug] = sub.id;
	});

	// 2. Clothings (modified to handle the combined return)
	const clothingResult = await seedClothingsSubcategories(db, categoryMap);
	[...clothingResult.parents, ...clothingResult.children].forEach((sub) => {
		subcategoryMap[sub.slug] = sub.id;
	});

	// 3. Kids (now returns all subcategories)
	const kidsSubcategories = await seedKidsSubcategories(db, categoryMap);
	kidsSubcategories.forEach((sub) => {
		subcategoryMap[sub.slug] = sub.id;
	});

	// 4. Collectables (now returns all subcategories)
	const collectablesSubcategories = await seedCollectablesSubcategories(db, categoryMap);
	collectablesSubcategories.forEach((sub) => {
		subcategoryMap[sub.slug] = sub.id;
	});

	return subcategoryMap;
}

/**
 * Creates a unique slug for subcategories that appear in multiple categories
 * by appending the parent category or subcategory name to the slug
 */
function createUniqueSlug<T>(slug: T, parentSlug: string) {
	if (slug === Subcategories.ACCESSORIES) {
		// Append parent slug to make accessories slug unique
		return `${slug}_${parentSlug}`;
	}
	return slug;
}

async function seedElectronicSubcategories(db: DrizzleClient['db'], categoryMap: Record<string, number>) {
	const electronicCategoryId = categoryMap[Categories.ELECTRONICS];
	if (!electronicCategoryId) {
		throw new Error(`Category with slug ${Categories.ELECTRONICS} not found`);
	}

	// First insert parent subcategories
	const parentSubcategories = SUBCATEGORY_SEEDS.electronics.filter(isParentGroupSeed).map((sub) => ({
		category_id: electronicCategoryId,
		name: sub.parent.name,
		slug: sub.parent.slug,
	}));

	// Add standalone subcategories (those without children)
	const standaloneSubcategories = SUBCATEGORY_SEEDS.electronics
		.filter((sub) => !isParentGroupSeed(sub))
		.map((sub) => ({
			category_id: electronicCategoryId,
			name: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.name : sub.name, Categories.ELECTRONICS),
			slug: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.slug : sub.slug, Categories.ELECTRONICS),
		}));

	const allParents = [...parentSubcategories, ...standaloneSubcategories];

	const insertedParents = await db.insert(subcategories).values(allParents).onConflictDoNothing().returning();

	console.log(`✅ Electronic Parent Subcategories Inserted: ${insertedParents.length}`);

	// Create a map of parent slugs to their IDs
	const parentMap = insertedParents.reduce<Record<string, number>>((map, parent) => {
		map[parent.slug] = parent.id;
		return map;
	}, {});

	// Then insert children subcategories
	let childSubcategories: ChildSubcategory[] = [];

	for (const group of SUBCATEGORY_SEEDS.electronics) {
		if (isParentGroupSeed(group)) {
			const parentId = parentMap[group.parent.slug];
			if (!parentId) {
				console.warn(`Parent subcategory ${group.parent.slug} not found, skipping its children`);
				continue;
			}

			const children = group.children.map((child) => ({
				category_id: electronicCategoryId,
				name: child.name,
				slug: createUniqueSlug(child.slug, group.parent.slug),
				parent_id: parentId,
				menu_order: child.menu_order || 0,
				easy_pay: child.easy_pay || false,
			}));

			childSubcategories = childSubcategories.concat(children);
		}
	}

	let insertedChildren: SelectSubCategories[] = [];
	if (childSubcategories.length > 0) {
		insertedChildren = await db.insert(subcategories).values(childSubcategories).onConflictDoNothing().returning();

		console.log(`✅ Electronic Child Subcategories Inserted: ${insertedChildren.length}`);
	}

	return [...insertedParents, ...insertedChildren];
}

async function seedClothingsSubcategories(db: DrizzleClient['db'], categoryMap: Record<string, number>) {
	const clothingCategoryId = categoryMap[Categories.CLOTHINGS];
	if (!clothingCategoryId) {
		throw new Error(`Category with slug ${Categories.CLOTHINGS} not found`);
	}

	// First insert parent subcategories
	const parentSubcategories = SUBCATEGORY_SEEDS.clothings.filter(isParentGroupSeed).map((sub) => ({
		category_id: clothingCategoryId,
		name: sub.parent.name,
		slug: sub.parent.slug,
	}));

	// Add standalone subcategories (those without children)
	const standaloneSubcategories = SUBCATEGORY_SEEDS.clothings
		.filter((sub) => !isParentGroupSeed(sub))
		.map((sub) => ({
			category_id: clothingCategoryId,
			name: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.name : sub.name, Categories.CLOTHINGS),
			slug: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.slug : sub.slug, Categories.CLOTHINGS),
		}));

	const allParents = [...parentSubcategories, ...standaloneSubcategories];

	const insertedParents = await db.insert(subcategories).values(allParents).onConflictDoNothing().returning();

	console.log(`✅ Clothing Parent Subcategories Inserted: ${insertedParents.length}`);

	// Create a map of parent slugs to their IDs
	const parentMap = insertedParents.reduce<Record<string, number>>((map, parent) => {
		map[parent.slug] = parent.id;
		return map;
	}, {});

	// Then insert children subcategories
	let childSubcategories: ChildSubcategory[] = [];

	for (const group of SUBCATEGORY_SEEDS.clothings) {
		if (isParentGroupSeed(group)) {
			const parentId = parentMap[group.parent.slug];
			if (!parentId) {
				console.warn(`Parent subcategory ${group.parent.slug} not found, skipping its children`);
				continue;
			}

			const children = group.children.map((child) => ({
				category_id: clothingCategoryId,
				name: child.name,
				slug: createUniqueSlug(child.slug, group.parent.slug),
				parent_id: parentId,
				menu_order: child.menu_order || 0,
				easy_pay: child.easy_pay || false,
			}));

			childSubcategories = childSubcategories.concat(children);
		}
	}

	let insertedChildren: SelectSubCategories[] = [];
	if (childSubcategories.length > 0) {
		insertedChildren = await db.insert(subcategories).values(childSubcategories).onConflictDoNothing().returning();

		console.log(`✅ Clothing Child Subcategories Inserted: ${insertedChildren.length}`);
	}

	return {
		parents: insertedParents,
		children: insertedChildren,
	};
}

async function seedKidsSubcategories(db: DrizzleClient['db'], categoryMap: Record<string, number>) {
	const kidsCategoryId = categoryMap[Categories.KIDS];
	if (!kidsCategoryId) {
		throw new Error(`Category with slug ${Categories.KIDS} not found`);
	}

	// First insert parent subcategories
	const parentSubcategories = SUBCATEGORY_SEEDS.kids.filter(isParentGroupSeed).map((sub) => ({
		category_id: kidsCategoryId,
		name: sub.parent.name,
		slug: sub.parent.slug,
	}));

	// Add standalone subcategories (those without children)
	const standaloneSubcategories = SUBCATEGORY_SEEDS.kids
		.filter((sub) => !isParentGroupSeed(sub))
		.map((sub) => ({
			category_id: kidsCategoryId,
			name: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.name : sub.name, Categories.KIDS),
			slug: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.slug : sub.slug, Categories.KIDS),
		}));

	const allParents = [...parentSubcategories, ...standaloneSubcategories];

	const insertedParents = await db.insert(subcategories).values(allParents).onConflictDoNothing().returning();

	console.log(`✅ Kids Parent Subcategories Inserted: ${insertedParents.length}`);

	// Create a map of parent slugs to their IDs
	const parentMap = insertedParents.reduce<Record<string, number>>((map, parent) => {
		map[parent.slug] = parent.id;
		return map;
	}, {});

	// Then insert children subcategories
	let childSubcategories: ChildSubcategory[] = [];

	for (const group of SUBCATEGORY_SEEDS.kids) {
		if (isParentGroupSeed(group)) {
			const parentId = parentMap[group.parent.slug];
			if (!parentId) {
				console.warn(`Parent subcategory ${group.parent.slug} not found, skipping its children`);
				continue;
			}

			const children = group.children.map((child) => ({
				category_id: kidsCategoryId,
				name: child.name,
				slug: child.slug,
				parent_id: parentId,
				menu_order: child.menu_order || 0,
				easy_pay: child.easy_pay || false,
			}));

			childSubcategories = childSubcategories.concat(children);
		}
	}

	let insertedChildren: SelectSubCategories[] = [];
	if (childSubcategories.length > 0) {
		insertedChildren = await db.insert(subcategories).values(childSubcategories).onConflictDoNothing().returning();

		console.log(`✅ Kids Child Subcategories Inserted: ${insertedChildren.length}`);
	}

	return [...insertedParents, ...insertedChildren];
}

async function seedCollectablesSubcategories(db: DrizzleClient['db'], categoryMap: Record<string, number>) {
	const collectablesCategoryId = categoryMap[Categories.COLLECTABLES];
	if (!collectablesCategoryId) {
		throw new Error(`Category with slug ${Categories.COLLECTABLES} not found`);
	}

	// First insert parent subcategories
	const parentSubcategories = SUBCATEGORY_SEEDS.collectables.filter(isParentGroupSeed).map((sub) => ({
		category_id: collectablesCategoryId,
		name: sub.parent.name,
		slug: sub.parent.slug,
	}));

	// Add standalone subcategories (those without children)
	const standaloneSubcategories = SUBCATEGORY_SEEDS.collectables
		.filter((sub) => !isParentGroupSeed(sub))
		.map((sub) => ({
			category_id: collectablesCategoryId,
			name: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.name : sub.name, Categories.COLLECTABLES),
			slug: createUniqueSlug(isParentGroupSeed(sub) ? sub.parent.slug : sub.slug, Categories.COLLECTABLES),
		}));

	const allParents = [...parentSubcategories, ...standaloneSubcategories];

	// Skip if no subcategories to insert
	if (allParents.length === 0) {
		console.log('ℹ️ No collectables subcategories to insert');
		return [];
	}

	const insertedParents = await db.insert(subcategories).values(allParents).onConflictDoNothing().returning();

	console.log(`✅ Collectables Parent Subcategories Inserted: ${insertedParents.length}`);

	// Create a map of parent slugs to their IDs
	const parentMap = insertedParents.reduce<Record<string, number>>((map, parent) => {
		map[parent.slug] = parent.id;
		return map;
	}, {});

	// Then insert children subcategories
	let childSubcategories: ChildSubcategory[] = [];

	for (const group of SUBCATEGORY_SEEDS.collectables) {
		if (isParentGroupSeed(group)) {
			const parentId = parentMap[group.parent.slug];
			if (!parentId) {
				console.warn(`Parent subcategory ${group.parent.slug} not found, skipping its children`);
				continue;
			}

			const children = group.children.map((child) => ({
				category_id: collectablesCategoryId,
				name: child.name,
				slug: child.slug,
				parent_id: parentId,
				menu_order: child.menu_order || 0,
				easy_pay: child.easy_pay || false,
			}));

			childSubcategories = childSubcategories.concat(children);
		}
	}

	let insertedChildren: SelectSubCategories[] = [];
	if (childSubcategories.length > 0) {
		insertedChildren = await db.insert(subcategories).values(childSubcategories).onConflictDoNothing().returning();

		console.log(`✅ Collectables Child Subcategories Inserted: ${insertedChildren.length}`);
	}

	return [...insertedParents, ...insertedChildren];
}

/**
 * Seeds properties table and returns a map of slug to id
 */
async function seedProperties(db: DrizzleClient['db']) {
	const insertedProperties = await db.insert(properties).values(PROPERTY_SEEDS).onConflictDoNothing().returning();

	console.log(`✅ Properties Inserted: ${insertedProperties.length}`);

	// Create a map for easier lookup by slug
	return insertedProperties.reduce(
		(map, property) => {
			map[property.slug] = property.id;
			return map;
		},
		{} as Record<string, number>,
	);
}

/**
 * Links properties to subcategories based on predefined rules
 */
async function linkPropertiesToSubcategories(
	db: DrizzleClient['db'],
	subcategoryMap: Record<string, number>,
	propertyMap: Record<string, number>,
) {
	// Define filter assignments by subcategory type
	const propertyAssignments = [
		// For filters that apply to all subcategories with the same flags, you can still use a flat array:
		{
			propertySlug: Properties.CONDITION,
			subcategories: Object.keys(subcategoryMap).map((slug) => ({
				slug,
				on_item_create_required: true,
				on_item_update_editable: true,
			})),
		},
		{
			propertySlug: Properties.DELIVERY_METHOD,
			subcategories: Object.keys(subcategoryMap).map((slug) => ({
				slug,
				on_item_create_required: true,
				on_item_update_editable: true,
			})),
		},
		...SUBCATEGORIES_PROPERTIES,
	];

	// Create subcategory-property links

	const subCategoryPropertyLinks = [];

	for (const assignment of propertyAssignments) {
		const propertyId = propertyMap[assignment.propertySlug];
		if (!propertyId) {
			console.warn(`Property with slug ${assignment.propertySlug} not found, skipping`);
			continue;
		}

		// Loop through the subcategories defined for this filter assignment
		for (const sub of assignment.subcategories) {
			const subcategoryId = subcategoryMap[sub.slug];
			if (!subcategoryId) {
				console.warn(`Subcategory with slug ${sub.slug} not found, skipping`);
				continue;
			}

			subCategoryPropertyLinks.push({
				subcategory_id: subcategoryId,
				property_id: propertyId,
				on_item_create_required: sub.on_item_create_required,
				on_item_update_editable: sub.on_item_update_editable,
			});
		}
	}

	if (subCategoryPropertyLinks.length > 0) {
		const insertedLinks = await db
			.insert(subcategory_properties)
			.values(subCategoryPropertyLinks)
			.onConflictDoNothing()
			.returning();

		console.log(`✅ Subcategory-Filter Links Inserted: ${insertedLinks.length}`);
		return insertedLinks;
	}

	return [];
}

/**
 * Seeds sample filter values
 */
async function seedPropertyValues(db: DrizzleClient['db'], insertedProperties: Record<string, number>) {
	// Map over the FILTER_VALUES constant to create the records for insertion
	const valuesToInsert = PROPERTY_VALUES.map((fv) => {
		const propertyId = insertedProperties[fv.slug];
		if (!propertyId) {
			console.warn(`Property with slug "${fv.slug}" not found, skipping value "${fv.value}"`);
			return null;
		}
		return {
			property_id: propertyId,
			...fv,
		};
	});

	if (valuesToInsert.length === 0) {
		console.warn('No property values to insert.');
		return [];
	}

	const insertedPropertyValues = await db
		.insert(property_values)
		// @ts-expect-error ignore seeder
		.values(valuesToInsert)
		.onConflictDoNothing()
		.returning();

	console.log(`✅ Property values Inserted: ${insertedPropertyValues.length}`);
	return insertedPropertyValues;
}

/**
 * Runs a verification query to check the seeded data
 */
async function verifySeeding(db: DrizzleClient['db']) {
	// Query to get human-readable subcategory-filter relationships
	const subCategoryPropertiesWithLabels = await db
		.select({
			subcategoryPropertyId: subcategory_properties.id,
			subcategoryName: subcategories.name,
			propertyName: properties.name,
		})
		.from(subcategory_properties)
		.innerJoin(subcategories, eq(subcategory_properties.subcategory_id, subcategories.id))
		.innerJoin(properties, eq(subcategory_properties.property_id, properties.id));

	console.log('🔍 Verification: SubCategory-Property Relationships:', subCategoryPropertiesWithLabels.length);

	// Optional: Count categories and subcategories
	const categoryCount = await db.select({ count: count() }).from(categories);

	const subcategoryCount = await db.select({ count: count() }).from(subcategories);

	console.log(
		`📊 Database now has ${categoryCount?.[0]?.count} categories and ${subcategoryCount?.[0]?.count} subcategories`,
	);
}
