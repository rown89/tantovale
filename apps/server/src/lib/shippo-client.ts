import { Shippo } from 'shippo';

import { parseEnv } from '../env';

export const shippoClient = new Shippo({
	apiKeyHeader: parseEnv(process.env).SHIPPING_PROVIDER_SECRET_KEY,
	shippoApiVersion: '2018-02-08',
});
