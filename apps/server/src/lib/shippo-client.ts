import { ShippoCore } from 'shippo/core.js';

import { parseEnv } from '../env';

export const shippoClient = new ShippoCore({
	apiKeyHeader: parseEnv(process.env).SHIPPING_PROVIDER_SECRET_KEY,
	shippoApiVersion: '2018-02-08',
});
