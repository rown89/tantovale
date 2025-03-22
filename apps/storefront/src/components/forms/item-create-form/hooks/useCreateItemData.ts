import { useQuery } from "@tanstack/react-query";
import { client } from "#lib/api";
import { useState } from "react";

interface Category {
  id: number;
  name: string;
  subcategories: Category[];
}

export function useCreateItemData(
  subcategory?: Omit<Category, "subcategories">,
) {
  const [nestedSubcategories, setNestedSubcategories] = useState<Category[]>(
    [],
  );

  // Fetch categories
  const {
    data: allCategories,
    isLoading: isLoadingCat,
    isError: isErrorCat,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await client.categories.$get();
      if (!res.ok) return [];
      return await res.json();
    },
  });

  // Fetch subcategories
  const {
    data: allSubcategories,
    isLoading: isLoadingSubCat,
    isError: isErrorSubCat,
  } = useQuery({
    queryKey: ["subcategories"],
    queryFn: async () => {
      const res = await client.subcategories.$get();
      if (!res.ok) return [];
      return await res.json();
    },
  });

  // Fetch subcategory filters
  const {
    data: subCatFilters,
    isLoading: isLoadingSubCatFilters,
    isError: isErrorSubCatFilters,
  } = useQuery({
    queryKey: ["filters_by_subcategories_filters", subcategory?.id],
    queryFn: async () => {
      if (!subcategory?.id) return [];

      const res = await client.filters.subcategory_filters[":id"].$get({
        param: {
          id: String(subcategory?.id),
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch subcategories filters");
        return [];
      }

      return await res.json();
    },
    enabled: !!subcategory?.id,
  });

  // Helper function to build nested subcategory hierarchy
  function buildNestedSubCatHierarchy() {
    // Convert subcategories array into a nested structure
    const subcategoryMap = new Map<number, any>();

    // Initialize subcategories map
    allSubcategories?.forEach((sub) => {
      subcategoryMap.set(sub.id, { ...sub, subcategories: [] });
    });

    // Build the hierarchy by linking parent subcategories
    allSubcategories?.forEach((sub) => {
      if (sub.parent_id) {
        const parent = subcategoryMap.get(sub.parent_id);
        if (parent) {
          parent.subcategories.push(subcategoryMap.get(sub.id));
        }
      }
    });

    if (allCategories?.length && allSubcategories?.length) {
      // Attach subcategories to categories
      const categoriesWithSubcategories = allCategories?.map((category) => ({
        ...category,
        subcategories: allSubcategories
          ?.filter((sub) => sub.category_id === category.id && !sub.parent_id)
          .map((sub) => subcategoryMap.get(sub.id)),
      }));

      setNestedSubcategories(categoriesWithSubcategories);
    }
  }

  return {
    allCategories,
    allSubcategories,
    subCatFilters,
    nestedSubcategories,
    isLoadingCat,
    isLoadingSubCat,
    isLoadingSubCatFilters,
    isErrorCat,
    isErrorSubCat,
    isErrorSubCatFilters,
    buildNestedSubCatHierarchy,
  };
}
