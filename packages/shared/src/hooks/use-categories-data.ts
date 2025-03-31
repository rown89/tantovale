import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/shared/clients/rpc-client';
import { Category } from '../types/category';

export function useCategoriesData(subcategory?: Omit<Category, 'subcategories'>) {
	const {
		data: allCategories,
		isLoading: isLoadingCat,
		isError: isErrorCat,
	} = useQuery({
		queryKey: ['categories'],
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
		queryKey: ['subcategories'],
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
		queryKey: ['filters_by_subcategories_filters', subcategory?.id],
		queryFn: async () => {
			if (!subcategory?.id) return [];

			const res = await client.filters.subcategory_filters[':id'].$get({
				param: {
					id: String(subcategory?.id),
				},
			});

			if (!res.ok) {
				console.error('Failed to fetch subcategories filters');
				return [];
			}

			return await res.json();
		},
		enabled: !!subcategory?.id,
	});

	return {
		allCategories,
		allSubcategories,
		subCatFilters,
		isLoadingCat,
		isLoadingSubCat,
		isLoadingSubCatFilters,
		isErrorCat,
		isErrorSubCat,
		isErrorSubCatFilters,
	};
}
