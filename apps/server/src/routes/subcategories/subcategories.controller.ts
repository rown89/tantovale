import type { Context } from 'hono';
import { getSubcategories, getSubcategoriesById, getSubcategoriesWithoutParentById } from './subcategories.service';

import { parsePositivePostgresInt } from '../../lib/parse-positive-postgres-int';
import type { AppBindings } from '../../lib/types';

export const getSubcategoriesController = async (c: Context<AppBindings>) => {
	try {
		const subcategories = await getSubcategories();

		if (!subcategories.length) {
			return c.json({ message: 'Missing subcategories' }, 404);
		}

		return c.json(subcategories, 200);
	} catch (error) {
		return c.json({ message: 'subcategoriesRoute error' }, 500);
	}
};

export const getSubcategoriesByIdController = async (c: Context<AppBindings>) => {
	const id = parsePositivePostgresInt(c.req.param('id'));

	if (id === null) return c.json({ error: 'subcategory id is required' }, 400);

	const subcategory = await getSubcategoriesById(c, id);

	if (!subcategory.length) {
		return c.json({ message: 'Invalid subcategory ID' }, 404);
	}

	return c.json(subcategory);
};

export const getSubcategoriesWithoutParentByIdController = async (c: Context<AppBindings>) => {
	const id = parsePositivePostgresInt(c.req.param('id'));

	if (id === null) return c.json({ error: 'Invalid id required' }, 400);

	const subcategoriesWithoutParent = await getSubcategoriesWithoutParentById(c, id);
	if (!subcategoriesWithoutParent.length) {
		return c.json({ message: 'Invalid subcategory ID' }, 404);
	}

	return c.json(subcategoriesWithoutParent);
};
