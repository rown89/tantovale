import { createClient } from '#database';
import { categories } from '#database/schemas/categories';

import { createRouter } from '#lib/create-app';

export const categoriesRoute = createRouter().get('/', async (c) => {
	try {
		const { db } = createClient();

		const categoryList = await db
			.select({
				id: categories.id,
				name: categories.name,
			})
			.from(categories);

		if (!categoryList.length) {
			return c.json({ message: 'Missing categoryList' }, 404);
		}

		return c.json(categoryList, 200);
	} catch (error) {
		return c.json({ message: 'categoriesRoute error' }, 500);
	}
});
