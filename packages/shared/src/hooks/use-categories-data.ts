import { useQuery } from '@tanstack/react-query';
import { client } from '@workspace/server/client-rpc';

export function useCategoriesData(subcategoryId?: number) {
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

	// Fetch subcategory properties
	const {
		data: subCatProperties,
		isLoading: isLoadingSubCatProperties,
		isError: isErrorSubCatProperties,
	} = useQuery({
		queryKey: ['properties_by_subcategories_properties', subcategoryId],
		queryFn: async () => {
			if (!subcategoryId) return [];

			const res = await client.properties.subcategory_properties[':id'].$get({
				param: {
					id: String(subcategoryId),
				},
			});

			if (!res.ok) {
				console.error('Failed to fetch subcategories properties');
				return [];
			}

			const data = await res.json();

			return data;
		},
		enabled: !!subcategoryId,
	});

	return {
		allCategories,
		allSubcategories,
		subCatProperties,
		isLoadingCat,
		isLoadingSubCat,
		isLoadingSubCatProperties,
		isErrorCat,
		isErrorSubCat,
		isErrorSubCatProperties,
	};
}
