export interface Category {
	id: number;
	name: string;
	subcategories: Category[];
}
