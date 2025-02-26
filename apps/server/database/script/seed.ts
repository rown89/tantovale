import { createClient } from "../";
import {
  categories,
  subcategories,
  filters,
  filterValues,
  subCategoryFilters,
} from "../schema/schema";
import { eq } from "drizzle-orm";

const seedDatabase = async () => {
  console.log("🌱 Seeding database...");

  const { db, client } = createClient(process.env.DATABASE_URL ?? "");

  try {
    // Begin transaction
    await client.query("BEGIN");

    // Insert Categories
    const insertedCategories = await db
      .insert(categories)
      .values([
        { name: "Electronic", slug: "electronic" },
        { name: "Clothing", slug: "clothing" },
        { name: "Kids", slug: "kids" },
        { name: "Collectables", slug: "collectables" },
      ])
      .onConflictDoNothing()
      .returning();

    console.log("✅ Categories Inserted:", insertedCategories);

    // Insert Subcategories for category "Electronic"
    const electronicSubcategories = await db
      .insert(subcategories)
      .values([
        {
          category_id: insertedCategories.find((c) => c.slug === "electronic")!
            .id,
          name: "Laptop's",
          slug: "laptops",
        },
        {
          category_id: insertedCategories.find((c) => c.slug === "electronic")!
            .id,
          name: "Smartphone's",
          slug: "smartphones",
        },
        {
          category_id: insertedCategories.find((c) => c.slug === "electronic")!
            .id,
          name: "Camera's",
          slug: "cameras",
        },
      ])
      .onConflictDoNothing()
      .returning();

    console.log(
      "✅ Electronic Subcategories Inserted:",
      electronicSubcategories,
    );

    // Insert Parent Subcategories for category "Clothing"
    // Insert "adult" and "kids" as parent subcategories
    const clothingCategory = insertedCategories.find(
      (c) => c.slug === "clothing",
    )!;

    const parentSubcategories = await db
      .insert(subcategories)
      .values([
        { category_id: clothingCategory.id, name: "Adult", slug: "adult" },
        { category_id: clothingCategory.id, name: "Kids", slug: "kids" },
      ])
      .onConflictDoNothing()
      .returning();

    console.log(
      "✅ Parent Clothing Subcategories Inserted:",
      parentSubcategories,
    );

    // Retrieve the generated IDs for "Adult" and "Kids"
    const adultSubcategory = parentSubcategories.find(
      (s) => s.slug === "adult",
    )!;

    const kidsSubcategory = parentSubcategories.find((s) => s.slug === "kids")!;

    // Insert Child Subcategories under "adult" and "kids"
    const childSubcategories = await db
      .insert(subcategories)
      .values([
        {
          category_id: clothingCategory.id,
          name: "Man",
          slug: "man_adult",
          parent_id: adultSubcategory.id,
        },
        {
          category_id: clothingCategory.id,
          name: "Girl",
          slug: "girl_adult",
          parent_id: adultSubcategory.id,
        },
        {
          category_id: clothingCategory.id,
          name: "Man",
          slug: "man_kids",
          parent_id: kidsSubcategory.id,
        },
        {
          category_id: clothingCategory.id,
          name: "Girl",
          slug: "girl_kids",
          parent_id: kidsSubcategory.id,
        },
      ])
      .onConflictDoNothing()
      .returning();

    console.log(
      "✅ Child Clothing Subcategories Inserted:",
      childSubcategories,
    );

    // Insert additional Subcategories for category "Kids"
    const kidsAdditionalSubcategories = await db
      .insert(subcategories)
      .values([
        {
          category_id: insertedCategories.find((c) => c.slug === "kids")!.id,
          name: "Toys",
          slug: "toys",
        },
      ])
      .onConflictDoNothing()
      .returning();

    console.log(
      "✅ Kids Additional Subcategories Inserted:",
      kidsAdditionalSubcategories,
    );

    // Insert Filters
    const insertedFilters = await db
      .insert(filters)
      .values([
        // Generic
        { name: "condition", slug: "conditions", type: "select" },
        { name: "gender", slug: "conditions", type: "select" },
        { name: "color", slug: "color", type: "select" },
        // Clothing
        { name: "size_clothing", slug: "size_clothing", type: "select" },
        { name: "material_clothing", slug: "material_clothing", type: "text" },
        // Phone
        {
          name: "size_phone_screen",
          slug: "size_phone_screen",
          type: "select",
        },
      ])
      .onConflictDoNothing()
      .returning();

    console.log("✅ Filters Inserted:", insertedFilters);

    // Link Filters to Subcategories (subCategoryFilters)
    const insertedSubCategoryFilters = await db
      .insert(subCategoryFilters)
      .values(
        [
          {
            subcategory_id: electronicSubcategories[0]?.id,
            filter_id: insertedFilters.find((f) => f.slug === "condition")!.id,
          },
          {
            subcategory_id: electronicSubcategories[1]?.id,
            filter_id: insertedFilters.find((f) => f.slug === "condition")!.id,
          },
          {
            subcategory_id: electronicSubcategories[2]?.id,
            filter_id: insertedFilters.find((f) => f.slug === "condition")!.id,
          },
          {
            subcategory_id: adultSubcategory.id,
            filter_id: insertedFilters.find((f) => f.slug === "condition")!.id,
          },
          {
            subcategory_id: kidsSubcategory.id,
            filter_id: insertedFilters.find((f) => f.slug === "condition")!.id,
          },
        ].filter(
          (item): item is { subcategory_id: number; filter_id: number } =>
            item.subcategory_id !== undefined,
        ),
      )
      .returning();

    console.log("✅ SubCategory Filters Inserted:", insertedSubCategoryFilters);

    // Insert Filter Values (Example: Brands for Electronics)
    const insertedFilterValues = await db
      .insert(filterValues)
      .values([
        {
          item_id: 1,
          filter_id: insertedFilters.find((f) => f.slug === "condition")!.id,
          value_text: "Apple",
        },
        {
          item_id: 1,
          filter_id: insertedFilters.find((f) => f.slug === "gender")!.id,
          value_number: 999,
        },
        {
          item_id: 2,
          filter_id: insertedFilters.find((f) => f.slug === "condition")!.id,
          value_text: "Samsung",
        },
        {
          item_id: 2,
          filter_id: insertedFilters.find((f) => f.slug === "gender")!.id,
          value_number: 799,
        },
        {
          item_id: 3,
          filter_id: insertedFilters.find((f) => f.slug === "size_clothing")!
            .id,
          value_text: "Red",
        },
      ])
      .onConflictDoNothing()
      .returning();

    console.log("✅ Filter Values Inserted:", insertedFilterValues);

    // Commit the transaction
    await client.query("COMMIT");
    console.log("🌱 Seeding completed!");

    // Example join query to retrieve human-readable subCategoryFilters
    const subCategoryFiltersWithLabels = await db
      .select({
        subCategoryFilterId: subCategoryFilters.id,
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
      "🔍 Human-readable SubCategory Filters:",
      subCategoryFiltersWithLabels,
    );
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    await client.query("ROLLBACK");
  } finally {
    await client.end();
    process.exit();
  }
};

seedDatabase();
