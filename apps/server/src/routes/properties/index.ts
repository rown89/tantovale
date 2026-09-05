import { getPropertiesByIdController, getPropertiesBySubcategoryPropertiesIdController } from './properties.controller';

import { createRouter } from '../../lib/create-app';
import { describeRoute } from 'hono-openapi';
import { catalogOpenApi } from '../../openapi/routes';

export const propertiesRoute = createRouter()
	.get('/:id', describeRoute(catalogOpenApi.property), getPropertiesByIdController)
	.get(
		'/subcategory_properties/:id',
		describeRoute(catalogOpenApi.properties),
		getPropertiesBySubcategoryPropertiesIdController,
	);
