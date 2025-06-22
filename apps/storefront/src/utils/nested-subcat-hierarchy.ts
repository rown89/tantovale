import { Category } from '@workspace/server/extended_schemas';

type SubCategory = Pick<Category, 'id' | 'name' | 'category_id' | 'parent_id' | 'menu_order'>;

export function nestedSubCatHierarchy(
	subCategories: SubCategory[],
	categories: Pick<Category, 'id' | 'name' | 'menu_order'>[],
) {
	// Convert subcategories array into a nested structure
	const subcategoryMap = new Map<
		number,
		{
			id: number;
			name: string;
			category_id: number;
			parent_id: number | null;
			menu_order: number;
			subcategories: SubCategory[];
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
			id: category.id,
			name: category.name,
			// Default menu_order to 0 for categories if not provided
			menu_order: category.menu_order || 0,
			subcategories: subCategories
				?.filter((sub) => sub.category_id === category.id && !sub.parent_id)
				.map((sub) => subcategoryMap.get(sub.id))
				.filter((sub): sub is NonNullable<typeof sub> => sub !== undefined),
		}));

		// return sorted by menu_order
		return categoriesWithSubcategories.sort((a, b) => a.menu_order - b.menu_order);
	} else return [];
}
