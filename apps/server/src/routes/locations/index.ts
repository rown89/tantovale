import { ilike, eq, and } from 'drizzle-orm';

import { createRouter } from '../../lib/create-app';
import { createClient } from '../../database';
import { cities } from '../../database/schemas/cities';
import { states } from '../../database/schemas/states';

export const locationsRoute = createRouter()
	.get('/search', async (c) => {
		const locationType = c.req.query('locationType') as 'city' | 'province';
		const locationName = c.req.query('locationName') as string;
		const locationCountryCode = c.req.query('locationCountryCode') ?? 'IT';
		const locationStateCode = c.req.query('locationStateCode') as string;

		if (!locationType) {
			return c.json({ message: 'Missing location type' }, 400);
		}

		if (!locationName?.trim()) {
			return c.json({ message: 'Missing location name' }, 400);
		}

		if (locationType !== 'city' && locationType !== 'province') {
			return c.json({ message: 'Invalid location type' }, 400);
		}

		if (locationType === 'province' && !locationCountryCode) {
			return c.json({ message: 'Missing location country code' }, 400);
		}

		const { db } = createClient();

		try {
			const sanitizedLocationName = locationName.trim();

			const baseConditions = [
				ilike(cities.name, `%${sanitizedLocationName}%`),
				eq(states.country_code, locationCountryCode),
				eq(states.country_id, 107), // filtering by country (107 - italy)
			];

			if (locationStateCode) {
				baseConditions.push(eq(cities.state_code, locationStateCode));
			}

			const innerJoinConditions = [
				eq(states.id, cities.state_id),
				eq(states.country_id, 107), // filtering by country (107 - italy)
			];

			const locationResponse = await db
				.select({
					id: cities.id,
					name: cities.name,
					country_code: states.country_code,
					state_code: states.state_code,
					country_id: states.country_id,
				})
				.from(cities)
				.innerJoin(states, and(...innerJoinConditions))
				.where(and(...baseConditions))
				.limit(10);

			return c.json(locationResponse, 200);
		} catch (error) {
			console.error('Location search error:', error);
			return c.json(
				{
					message: 'Failed to search locations',
					error: error instanceof Error ? error.message : 'Unknown error',
				},
				500,
			);
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
