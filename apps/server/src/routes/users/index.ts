import { eq } from 'drizzle-orm';

import { createClient } from '../../database';
import { users } from '../../database/schemas/schema';
import { createRouter } from '../../lib/create-app';

export const usersRoute = createRouter().get('/:id{[0-9]+}', (c) => {
	const id = c.req.param('id');

	try {
		const { db } = createClient();

		const user = db
			.select()
			.from(users)
			.where(eq(users.id, Number(id)))
			.limit(1);

		if (!user) return c.json([], 404);

		return c.json(user, 200);
	} catch (error) {
		return c.json({ message: 'usersRoute error' }, 500);
	}
});
