import { SelectSubCategories } from 'src/database/schemas/schema';

export interface Category extends Omit<SelectSubCategories, 'created_at' | 'updated_at'> {
	subcategories?: Pick<Category, 'id' | 'name' | 'category_id' | 'parent_id'>[];
}
