import { ShippoCore } from 'shippo/core.js';

import { environment } from '#utils/constants';

export const shippoClient = new ShippoCore({
	apiKeyHeader: environment.SHIPPING_PROVIDER_SECRET_KEY,
	shippoApiVersion: '2018-02-08',
});
