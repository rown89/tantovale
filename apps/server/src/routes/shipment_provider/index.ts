import { Shippo } from 'shippo';
import { createClient } from '../../database';

import { createRouter } from '../../lib/create-app';
import { shippoClient } from '../../lib/shippo-client';

export const shipmentProviderRoute = createRouter().post('/', async (c) => {
	const rates = await shippoClient.rates.create({
		address_from: '1180 Bruxelles',
		address_to: '1000 Bruxelles',
		parcels: [
			{
				length: 10,
			},
		],
	});

	const { db } = createClient();

	return c.json({ rates });
});
