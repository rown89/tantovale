import {
	getSubcategoriesByIdController,
	getSubcategoriesController,
	getSubcategoriesWithoutParentByIdController,
} from './subcategories.controller';

import { createRouter } from '../../lib/create-app';
import { describeRoute } from 'hono-openapi';
import { catalogOpenApi } from '../../openapi/routes';

export const subcategoriesRoute = createRouter()
	.get('/', describeRoute(catalogOpenApi.subcategories), getSubcategoriesController)
	.get('/:id', describeRoute(catalogOpenApi.subcategory), getSubcategoriesByIdController)
	.get(
		'/no_parent/:id',
		describeRoute(catalogOpenApi.subcategoryWithoutParent),
		getSubcategoriesWithoutParentByIdController,
	);
