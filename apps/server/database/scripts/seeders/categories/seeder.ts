import { count, eq } from "drizzle-orm";
import { nodeClient, type DrizzleClient } from "../../..";
import {
  categories,
  subcategories,
  filters,
  subCategoryFilters,
  filterValues,
} from "../../../schema/schema";
import {
  CATEGORY_SEEDS,
  SUBCATEGORY_SEEDS,
  FILTER_SEEDS,
  Categories,
  Subcategories,
  FILTER_VALUES,
} from "./constants";

export const seedDatabase = async (databaseUrl: string): Promise<void> => {
  console.log("🌱 Starting database seeding...");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL not provided");
  }

  const { db, client } = nodeClient(databaseUrl);

  try {
    // Begin transaction
    await client.query("BEGIN");

    // Seed categories and store result in a map for easier access
    const categoryMap = await seedCategories(db);

    // Seed subcategories using the category map
    const subcategoryMap = await seedSubcategories(db, categoryMap);

    // Seed filters
    const filterMap = await seedFilters(db);

    await seedFilterValues(db, filterMap);

    // Link filters to subcategories
    await linkFiltersToSubcategories(db, subcategoryMap, filterMap);

    // Run a verification query to show the results
    await verifySeeding(db);

    // Commit the transaction
    await client.query("COMMIT");
    console.log("🌱 Seeding completed successfully!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
};

/**
 * Seeds categories table and returns a map of slug to id
 */
async function seedCategories(db: DrizzleClient["db"]) {
  const insertedCategories = await db
    .insert(categories)
    .values(CATEGORY_SEEDS)
    .onConflictDoNothing()
    .returning();

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
  db: DrizzleClient["db"],
  categoryMap: Record<string, number>,
): Promise<Record<string, number>> {
  const subcategoryMap: Record<string, number> = {};

  // 1. Electronic subcategories
  const electronicSubcategories = await seedElectronicSubcategories(
    db,
    categoryMap,
  );
  // Add electronic subcategories to the map
  electronicSubcategories.forEach((sub) => {
    subcategoryMap[sub.slug] = sub.id;
  });

  // 2. Clothing subcategories (with parent-child hierarchy)
  const { parents, children } = await seedClothingSubcategories(
    db,
    categoryMap,
  );
  // Add clothing parent subcategories to the map
  parents.forEach((sub) => {
    subcategoryMap[sub.slug] = sub.id;
  });
  // Add clothing child subcategories to the map
  children.forEach((sub) => {
    subcategoryMap[sub.slug] = sub.id;
  });

  // 3. Kids subcategories
  const kidsSubcategories = await seedKidsSubcategories(db, categoryMap);
  // Add kids subcategories to the map
  kidsSubcategories.forEach((sub) => {
    subcategoryMap[sub.slug] = sub.id;
  });

  // 4. Collectables subcategories
  const collectablesSubcategories = await seedCollectablesSubcategories(
    db,
    categoryMap,
  );
  // Add collectables subcategories to the map
  collectablesSubcategories.forEach((sub) => {
    subcategoryMap[sub.slug] = sub.id;
  });

  return subcategoryMap;
}

async function seedElectronicSubcategories(
  db: DrizzleClient["db"],
  categoryMap: Record<string, number>,
) {
  const electronicCategoryId = categoryMap[Categories.ELECTRONIC];
  if (!electronicCategoryId) {
    throw new Error(`Category with slug ${Categories.ELECTRONIC} not found`);
  }

  const electronicSubcategorySeeds = SUBCATEGORY_SEEDS.electronic.map(
    (sub) => ({
      category_id: electronicCategoryId,
      name: sub.name,
      slug: sub.slug,
    }),
  );

  const insertedElectronicSubcategories = await db
    .insert(subcategories)
    .values(electronicSubcategorySeeds)
    .onConflictDoNothing()
    .returning();

  console.log(
    `✅ Electronic Subcategories Inserted: ${insertedElectronicSubcategories.length}`,
  );

  return insertedElectronicSubcategories;
}

async function seedClothingSubcategories(
  db: DrizzleClient["db"],
  categoryMap: Record<string, number>,
) {
  const clothingCategoryId = categoryMap[Categories.CLOTHING];
  if (!clothingCategoryId) {
    throw new Error(`Category with slug ${Categories.CLOTHING} not found`);
  }

  // First insert parent subcategories
  const clothingParentSubcategoriesData = SUBCATEGORY_SEEDS.clothing.map(
    (group) => ({
      category_id: clothingCategoryId,
      name: group.parent.name,
      slug: group.parent.slug,
    }),
  );

  const insertedClothingParents = await db
    .insert(subcategories)
    .values(clothingParentSubcategoriesData)
    .onConflictDoNothing()
    .returning();

  console.log(
    `✅ Clothing Parent Subcategories Inserted: ${insertedClothingParents.length}`,
  );

  // Create a map of parent slugs to their IDs
  const clothingParentMap = insertedClothingParents.reduce<
    Record<string, number>
  >((map, parent) => {
    map[parent.slug] = parent.id;
    return map;
  }, {});

  // Then insert children subcategories
  let clothingChildSubcategories: Array<{
    category_id: number;
    name: string;
    slug: string;
    parent_id: number;
  }> = [];

  for (const group of SUBCATEGORY_SEEDS.clothing) {
    const parentId = clothingParentMap[group.parent.slug];
    if (!parentId) {
      console.warn(
        `Parent subcategory ${group.parent.slug} not found, skipping its children`,
      );
      continue;
    }

    const children = group.children.map((child) => ({
      category_id: clothingCategoryId,
      name: child.name,
      slug: child.slug,
      parent_id: parentId,
    }));

    clothingChildSubcategories = clothingChildSubcategories.concat(children);
  }

  let insertedClothingChildren: any[] = [];
  if (clothingChildSubcategories.length > 0) {
    insertedClothingChildren = await db
      .insert(subcategories)
      .values(clothingChildSubcategories)
      .onConflictDoNothing()
      .returning();

    console.log(
      `✅ Clothing Child Subcategories Inserted: ${insertedClothingChildren.length}`,
    );
  }

  return {
    parents: insertedClothingParents,
    children: insertedClothingChildren,
  };
}

async function seedKidsSubcategories(
  db: DrizzleClient["db"],
  categoryMap: Record<string, number>,
) {
  const kidsCategoryId = categoryMap[Categories.KIDS];
  if (!kidsCategoryId) {
    throw new Error(`Category with slug ${Categories.KIDS} not found`);
  }

  const kidsSubcategorySeeds = SUBCATEGORY_SEEDS.kids.map((sub) => ({
    category_id: kidsCategoryId,
    name: sub.name,
    slug: sub.slug,
  }));

  const insertedKidsSubcategories = await db
    .insert(subcategories)
    .values(kidsSubcategorySeeds)
    .onConflictDoNothing()
    .returning();

  console.log(
    `✅ Kids Subcategories Inserted: ${insertedKidsSubcategories.length}`,
  );

  return insertedKidsSubcategories;
}

async function seedCollectablesSubcategories(
  db: DrizzleClient["db"],
  categoryMap: Record<string, number>,
) {
  const collectablesCategoryId = categoryMap[Categories.COLLECTABLES];
  if (!collectablesCategoryId) {
    throw new Error(`Category with slug ${Categories.COLLECTABLES} not found`);
  }

  const collectablesSubcategorySeeds = SUBCATEGORY_SEEDS.collectables.map(
    (sub) => ({
      category_id: collectablesCategoryId,
      name: sub.name,
      slug: sub.slug,
    }),
  );

  if (collectablesSubcategorySeeds.length > 0) {
    const insertedCollectablesSubcategories = await db
      .insert(subcategories)
      .values(collectablesSubcategorySeeds)
      .onConflictDoNothing()
      .returning();

    console.log(
      `✅ Collectables Subcategories Inserted: ${insertedCollectablesSubcategories.length}`,
    );

    return insertedCollectablesSubcategories;
  }

  return [];
}

/**
 * Seeds filters table and returns a map of slug to id
 */
async function seedFilters(db: DrizzleClient["db"]) {
  const insertedFilters = await db
    .insert(filters)
    .values(FILTER_SEEDS)
    .onConflictDoNothing()
    .returning();

  console.log(`✅ Filters Inserted: ${insertedFilters.length}`);

  // Create a map for easier lookup by slug
  return insertedFilters.reduce(
    (map, filter) => {
      map[filter.slug] = filter.id;
      return map;
    },
    {} as Record<string, number>,
  );
}

/**
 * Links filters to subcategories based on predefined rules
 */
async function linkFiltersToSubcategories(
  db: DrizzleClient["db"],
  subcategoryMap: Record<string, number>,
  filterMap: Record<string, number>,
) {
  // Define filter assignments by subcategory type
  const filterAssignments = [
    // Assign condition filter to all subcategories
    {
      filterSlug: "condition",
      subcategorySlugs: Object.keys(subcategoryMap),
    },
    // Assign size_clothing filter to clothing subcategories
    {
      filterSlug: "size_clothing",
      subcategorySlugs: [
        Subcategories.MAN_ADULT,
        Subcategories.WOMEN_ADULT,
        Subcategories.MAN_KIDS,
        Subcategories.GIRL_KIDS,
      ],
    },
    // Assign size_phone_screen filter to smartphones
    {
      filterSlug: "size_phone_screen",
      subcategorySlugs: [Subcategories.SMARTPHONES],
    },
  ];

  // Create subcategory-filter links
  const subCategoryFilterLinks = [];

  for (const assignment of filterAssignments) {
    const filterId = filterMap[assignment.filterSlug];
    if (!filterId) {
      console.warn(
        `Filter with slug ${assignment.filterSlug} not found, skipping`,
      );
      continue;
    }

    for (const subcategorySlug of assignment.subcategorySlugs) {
      const subcategoryId = subcategoryMap[subcategorySlug];
      if (!subcategoryId) {
        console.warn(
          `Subcategory with slug ${subcategorySlug} not found, skipping`,
        );
        continue;
      }

      subCategoryFilterLinks.push({
        subcategory_id: subcategoryId,
        filter_id: filterId,
      });
    }
  }

  if (subCategoryFilterLinks.length > 0) {
    const insertedLinks = await db
      .insert(subCategoryFilters)
      .values(subCategoryFilterLinks)
      .onConflictDoNothing()
      .returning();

    console.log(
      `✅ Subcategory-Filter Links Inserted: ${insertedLinks.length}`,
    );
    return insertedLinks;
  }

  return [];
}

/**
 * Seeds sample filter values
 */
async function seedFilterValues(
  db: DrizzleClient["db"],
  insertedFilters: Record<string, number>,
) {
  // Map over the FILTER_VALUES constant to create the records for insertion
  const valuesToInsert = FILTER_VALUES.map((fv) => {
    const filterId = insertedFilters[fv.slug];
    if (!filterId) {
      console.warn(
        `Filter with slug "${fv.slug}" not found, skipping value "${fv.value}"`,
      );
      return null;
    }
    return {
      filter_id: filterId,
      value: fv.value,
    };
  }).filter(
    (value): value is { filter_id: number; value: string } => value !== null,
  ); // Remove any nulls

  if (valuesToInsert.length === 0) {
    console.warn("No filter values to insert.");
    return [];
  }

  const insertedFilterValues = await db
    .insert(filterValues)
    .values(valuesToInsert)
    .onConflictDoNothing()
    .returning();

  console.log(`✅ Filter values Inserted: ${insertedFilterValues.length}`);
  return insertedFilterValues;
}

/**
 * Runs a verification query to check the seeded data
 */
async function verifySeeding(db: DrizzleClient["db"]) {
  // Query to get human-readable subcategory-filter relationships
  const subCategoryFiltersWithLabels = await db
    .select({
      subcategoryFilterId: subCategoryFilters.id,
      subcategoryName: subcategories.name,
      filterName: filters.name,
    })
    .from(subCategoryFilters)
    .innerJoin(
      subcategories,
      eq(subCategoryFilters.subcategory_id, subcategories.id),
    )
    .innerJoin(filters, eq(subCategoryFilters.filter_id, filters.id));

  console.log(
    "🔍 Verification: SubCategory-Filter Relationships:",
    subCategoryFiltersWithLabels.length,
  );

  // Optional: Count categories and subcategories
  const categoryCount = await db.select({ count: count() }).from(categories);

  const subcategoryCount = await db
    .select({ count: count() })
    .from(subcategories);

  console.log(
    `📊 Database now has ${categoryCount?.[0]?.count} categories and ${subcategoryCount?.[0]?.count} subcategories`,
  );
}
