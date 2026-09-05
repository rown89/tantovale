import { ShippoCore } from 'shippo/core.js';
import { HTTPClient } from 'shippo/lib/http.js';

import { environment } from '#utils/constants';

const httpClient = new HTTPClient();
httpClient.addHook(
	'beforeRequest',
	(request) => new Request(request, { signal: AbortSignal.timeout(environment.PROVIDER_REQUEST_TIMEOUT_MS) }),
);

export const shippoClient = new ShippoCore({
	apiKeyHeader: environment.SHIPPING_PROVIDER_API_KEY,
	shippoApiVersion: '2018-02-08',
	serverURL: environment.SHIPPING_PROVIDER_API_URL,
	httpClient,
});
