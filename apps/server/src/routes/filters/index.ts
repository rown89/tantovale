import { getFilterByIdController, getFiltersBySubcategoryFiltersId } from './filters.controller';

import { createRouter } from '../../lib/create-app';

export const filtersRoute = createRouter()
	.get('/:id', getFilterByIdController)
	.get('/subcategory_filters/:id', getFiltersBySubcategoryFiltersId);
