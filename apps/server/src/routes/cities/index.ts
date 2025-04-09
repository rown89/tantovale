import { createRouter } from '../../lib/create-app';
import { createClient } from '../../database';
import { cities } from '../../database/schemas/cities';
import { states } from '../../database/schemas/states';
import { ilike, eq, and } from 'drizzle-orm';

export const citiesRoute = createRouter()
	.get('/search_name/:name', async (c) => {
		const name = c.req.param('name');

		if (!name) return c.json({ message: 'Missing city name' }, 401);

		const { db } = createClient();

		try {
			const cityResponse = await db
				.select({
					id: cities.id,
					name: cities.name,
					stateCode: states.state_code,
				})
				.from(cities)
				.innerJoin(
					states,
					and(
						eq(states.id, cities.state_id),
						eq(states.country_id, 107), // 107 (italy)
					),
				)
				.where(ilike(cities.name, `${name}%`))
				.limit(10); // Limit results for better performance

			return c.json(cityResponse, 200);
		} catch (error) {
			console.log(error);
			return c.json(
				{
					message: 'Get city name error',
				},
				500,
			);
		}
	})
	.get('/search_id/:id', async (c) => {
		const id = Number(c.req.param('id'));

		if (!id) return c.json({ message: 'Invalid city id provided' }, 401);

		const { db } = createClient();

		try {
			const [cityResponse] = await db
				.select({
					id: cities.id,
					name: cities.name,
					stateCode: states.state_code,
				})
				.from(cities)
				.innerJoin(
					states,
					and(eq(states.id, cities.state_id), eq(states.country_id, 107)), // 107 (italy)
				)
				.where(eq(cities.id, Number(id)))
				.limit(1);

			return c.json({ cityResponse }, 200);
		} catch (error) {
			return c.json(
				{
					message: 'Get city id error',
				},
				500,
			);
		}
	});
