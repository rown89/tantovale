import { Category } from "@workspace/server/extended_schemas";

export function nestedSubCatHierarchy(
  subCategories: Pick<Category, "id" | "name" | "category_id" | "parent_id">[],
  categories: Pick<Category, "id" | "name">[],
) {
  // Convert subcategories array into a nested structure
  const subcategoryMap = new Map<
    number,
    {
      id: number;
      name: string;
      category_id: number;
      parent_id: number | null;
      subcategories: Pick<
        Category,
        "id" | "name" | "category_id" | "parent_id"
      >[];
    }
  >();

  // Initialize subcategories map
  subCategories?.forEach((sub) => {
    subcategoryMap.set(sub.id, { ...sub, subcategories: [] });
  });

  // Build the hierarchy by linking parent subcategories
  subCategories?.forEach((sub) => {
    if (sub.parent_id) {
      const parent = subcategoryMap.get(sub.parent_id);
      if (parent) {
        const subItem = subcategoryMap.get(sub.id);

        if (subItem && parent && parent?.subcategories) {
          parent?.subcategories.push(subItem);
        }
      }
    }
  });

  if (categories?.length && categories?.length) {
    // Attach subcategories to categories
    const categoriesWithSubcategories = categories?.map((category) => ({
      ...category,
      subcategories: subCategories
        ?.filter((sub) => sub.category_id === category.id && !sub.parent_id)
        .map((sub) => subcategoryMap.get(sub.id))
        .filter((sub): sub is NonNullable<typeof sub> => sub !== undefined),
    }));

    return categoriesWithSubcategories;
  } else return [];
}
