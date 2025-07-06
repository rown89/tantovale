import { client } from '@workspace/server/client-rpc';
import * as enumeratedValues from '@workspace/server/enumerated_values';

type OrdersResponse = Awaited<ReturnType<(typeof client.orders.auth.status)[':status']['$get']>>;
type OrdersData = Awaited<ReturnType<OrdersResponse['json']>>;
export type OrderType = NonNullable<OrdersData>[number];

export { enumeratedValues };
