import {
	getFiltersForSubcategoryController,
	getFiterSubcategoryByIdController,
} from './subcategory-properties.controller';

import { createRouter } from '../../lib/create-app';

export const subcategoryPropertiesRoute = createRouter()
	.get('/:id', async (c) => getFiterSubcategoryByIdController(c))
	.get('/filter/:id', async (c) => getFiltersForSubcategoryController(c));
