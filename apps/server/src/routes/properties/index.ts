import { getPropertiesByIdController, getPropertiesBySubcategoryPropertiesIdController } from './properties.controller';

import { createRouter } from '../../lib/create-app';

export const propertiesRoute = createRouter()
	.get('/:id', getPropertiesByIdController)
	.get('/subcategory_properties/:id', getPropertiesBySubcategoryPropertiesIdController);
