import {
	getSubcategoriesByIdController,
	getSubcategoriesController,
	getSubcategoriesWithoutParentByIdController,
} from './subcategories.controller';

import { createRouter } from '../../lib/create-app';

export const subcategoriesRoute = createRouter()
	.get('/', getSubcategoriesController)
	.get('/:id', getSubcategoriesByIdController)
	.get('/no_parent/:id', getSubcategoriesWithoutParentByIdController);
