import {
	getFiltersForSubcategoryController,
	getFiterSubcategoryByIdController,
} from './subcategory-properties.controller';

import { createRouter } from '../../lib/create-app';
import { describeRoute } from 'hono-openapi';
import { catalogOpenApi } from '../../openapi/routes';

export const subcategoryPropertiesRoute = createRouter()
	.get('/:id', describeRoute(catalogOpenApi.subcategoryProperty), async (c) => getFiterSubcategoryByIdController(c))
	.get('/filter/:id', describeRoute(catalogOpenApi.subcategoryFilters), async (c) =>
		getFiltersForSubcategoryController(c),
	);
