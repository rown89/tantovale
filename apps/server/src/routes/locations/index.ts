import { ilike, eq, and } from 'drizzle-orm';

import { createRouter } from '../../lib/create-app';
import { createClient } from '../../database';
import { cities } from '../../database/schemas/cities';
import { states } from '../../database/schemas/states';

export const locationsRoute = createRouter()
	.get('/search', async (c) => {
		const locationType = c.req.query('locationType') as 'city' | 'province';
		const locationName = c.req.query('locationName') as string;
		const locationStateCode = c.req.query('locationStateCode') as string;

		if (!locationName) return c.json({ message: 'Missing location name' }, 401);
		if (!locationType) return c.json({ message: 'Missing location type' }, 401);

		if (locationType !== 'city' && locationType !== 'province') {
			return c.json({ message: 'Invalid location type' }, 401);
		}

		if (locationType === 'province' && !locationStateCode) {
			return c.json({ message: 'Missing location state code' }, 401);
		}

		const { db } = createClient();

		try {
			const locationResponse = await db
				.select({
					id: cities.id,
					name: cities.name,
					state_code: states.state_code,
				})
				.from(cities)
				.innerJoin(
					states,
					and(
						eq(states.id, cities.state_id),
						eq(states.country_id, 107), // filtering by country (107 - italy)
					),
				)
				.where(
					and(
						ilike(cities.name, `${locationName}%`),
						locationStateCode ? eq(states.state_code, locationStateCode as string) : undefined,
						eq(states.country_id, 107), // filtering by country (107 - italy)
					),
				)
				.limit(10); // Limit results for better performance

			return c.json(locationResponse, 200);
		} catch (error) {
			return c.json({ message: 'Get Location name error' }, 500);
		}
	})
	.get('/search_by_id/:locationType/:locationId', async (c) => {
		const locationType = c.req.param('locationType');
		const locationId = Number(c.req.param('locationId'));

		if (!locationId) return c.json({ message: 'Invalid location id provided' }, 401);

		const { db } = createClient();

		try {
			const [locationResponse] = await db
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
				.where(eq(cities.id, Number(locationId)))
				.limit(1);

			return c.json({ locationResponse }, 200);
		} catch (error) {
			return c.json(
				{
					message: 'Get location id error',
				},
				500,
			);
		}
	});
