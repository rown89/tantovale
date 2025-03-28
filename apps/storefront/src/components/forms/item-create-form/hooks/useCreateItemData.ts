import { useQuery } from "@tanstack/react-query";
import { client } from "#lib/api";
import { Category } from "..";

export function useCreateItemData(
  subcategory?: Omit<Category, "subcategories">,
  cityName?: string,
) {
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

  // Fetch cities
  const {
    data: cities,
    isLoading: isLoadingCities,
    isError: isErrorCities,
  } = useQuery({
    queryKey: ["cities-name", cityName],
    queryFn: async () => {
      if (cityName && cityName?.length > 2) {
        const res = await client.cities.search_name[":name"].$get({
          param: {
            name: cityName,
          },
        });

        if (!res.ok) return [];

        return await res.json();
      } else {
        return [];
      }
    },
  });

  return {
    allCategories,
    allSubcategories,
    subCatFilters,
    cities,
    isLoadingCat,
    isLoadingSubCat,
    isLoadingSubCatFilters,
    isLoadingCities,
    isErrorCat,
    isErrorSubCat,
    isErrorSubCatFilters,
    isErrorCities,
  };
}
