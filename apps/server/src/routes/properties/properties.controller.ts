import type { Context } from 'hono';
import { getPropertiesByIdService, getPropertiesBySubcategoryPropertiesIdService } from './properties.service';

import type { AppBindings } from '../../lib/types';

export const getPropertiesByIdController = async (c: Context<AppBindings>) => {
	const id = Number(c.req.param('id'));

	if (isNaN(id)) return c.json({ message: 'Invalid filter ID' }, 400);

	return getPropertiesByIdService(c, id);
};

export const getPropertiesBySubcategoryPropertiesIdController = async (c: Context<AppBindings>) => {
	const id = Number(c.req.param('id'));

	if (isNaN(id)) return c.json({ message: 'Invalid filter ID' }, 400);

	try {
		const propertiesList = await getPropertiesBySubcategoryPropertiesIdService(c, id);

		if (!propertiesList.length) {
			return c.json({ message: 'Missing getPropertiesBySubcategoryPropertiesId properties' }, 500);
		}

		return c.json(propertiesList, 200);
	} catch (error) {
		return c.json({ message: 'getPropertiesBySubcategoryPropertiesId error' }, 500);
	}
};
