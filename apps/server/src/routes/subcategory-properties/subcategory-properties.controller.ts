import type { Context } from 'hono';
import { getFiltersForSubcategory, getSubcategoryPropertiesById } from './subcategory-propertiess.service';

import { parsePositivePostgresInt } from '../../lib/parse-positive-postgres-int';
import type { AppBindings } from '../../lib/types';

export const getFiterSubcategoryByIdController = async (c: Context<AppBindings>) => {
	const id = parsePositivePostgresInt(c.req.param('id'));

	if (id === null) return c.json({ error: 'subcategory id is required' }, 400);

	try {
		const filters = await getSubcategoryPropertiesById(c, id);

		if (!filters.length) return c.json({ message: 'Missing subcategoryFilters' }, 404);

		return c.json(filters, 200);
	} catch (error) {
		return c.json({ message: 'subcategoriesRoute error' }, 500);
	}
};

export const getFiltersForSubcategoryController = async (c: Context<AppBindings>) => {
	const id = parsePositivePostgresInt(c.req.param('id'));

	if (id === null) return c.json({ error: 'filter id is required' }, 400);

	const filters = await getFiltersForSubcategory(c, id);
	if (!filters.length) return c.json({ message: 'Missing subcategoryFilters' }, 404);

	return c.json(filters);
};
