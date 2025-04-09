import type { Context } from 'hono';
import { getFilterByIdService, getFiltersBySubcategoryFiltersIdService } from './filters.service';

import type { AppBindings } from '../../lib/types';

export const getFilterByIdController = async (c: Context<AppBindings>) => {
	const id = Number(c.req.param('id'));

	if (isNaN(id)) return c.json({ message: 'Invalid filter ID' }, 400);

	return getFilterByIdService(c, id);
};

export const getFiltersBySubcategoryFiltersId = async (c: Context<AppBindings>) => {
	const id = Number(c.req.param('id'));

	if (isNaN(id)) return c.json({ message: 'Invalid filter ID' }, 400);

	try {
		const filtersList = await getFiltersBySubcategoryFiltersIdService(c, id);

		if (!filtersList.length) {
			return c.json({ message: 'Missing getFiltersBySubcategoryFiltersIdService filters' }, 500);
		}

		return c.json(filtersList, 200);
	} catch (error) {
		return c.json({ message: 'getFiltersBySubcategoryFiltersIdService error' }, 500);
	}
};
