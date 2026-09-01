export type RouteMethod = 'GET' | 'POST' | 'PUT';

/**
 * Target authorization contract consumed by later route suites. It is not inferred from Hono metadata.
 * `cron-secret` and `webhook-basic` are final intended security contracts from Plan 04, not claims that
 * current legacy middleware already enforces them; dedicated later tests implement and prove those contracts.
 */
export type RouteAuth =
	| 'public'
	| 'optional-access-refresh-cookie'
	| 'access-refresh-cookie'
	| 'refresh-cookie'
	| 'cron-secret'
	| 'webhook-basic';
export type RouteSuite =
	| 'addresses'
	| 'authentication'
	| 'catalog'
	| 'chat'
	| 'cron'
	| 'documentation'
	| 'favorites'
	| 'items'
	| 'orders'
	| 'platform-costs'
	| 'profiles'
	| 'proposals'
	| 'shipping'
	| 'uploads'
	| 'webhooks';

export type RouteContract = {
	method: RouteMethod;
	path: string;
	auth: RouteAuth;
	suite: RouteSuite;
};

export const routeContracts = [
	{ method: 'GET', path: '/', auth: 'public', suite: 'documentation' },
	{ method: 'GET', path: '/openapi', auth: 'public', suite: 'documentation' },
	{ method: 'GET', path: '/addresses/auth/addresses_profile', auth: 'access-refresh-cookie', suite: 'addresses' },
	{ method: 'GET', path: '/addresses/auth/default_address', auth: 'access-refresh-cookie', suite: 'addresses' },
	{ method: 'POST', path: '/addresses/auth/add_address_to_profile', auth: 'access-refresh-cookie', suite: 'addresses' },
	{
		method: 'PUT',
		path: '/addresses/auth/hide_address_from_profile',
		auth: 'access-refresh-cookie',
		suite: 'addresses',
	},
	{
		method: 'PUT',
		path: '/addresses/auth/update_address_to_profile',
		auth: 'access-refresh-cookie',
		suite: 'addresses',
	},
	{ method: 'GET', path: '/categories', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/chat/auth/rooms', auth: 'access-refresh-cookie', suite: 'chat' },
	{ method: 'GET', path: '/chat/auth/rooms/:roomId/messages', auth: 'access-refresh-cookie', suite: 'chat' },
	{ method: 'GET', path: '/chat/auth/rooms/id/:item_id', auth: 'access-refresh-cookie', suite: 'chat' },
	{ method: 'POST', path: '/chat/auth/rooms', auth: 'access-refresh-cookie', suite: 'chat' },
	{ method: 'POST', path: '/chat/auth/rooms/:roomId/messages', auth: 'access-refresh-cookie', suite: 'chat' },
	{ method: 'GET', path: '/cron/auth/expired-orders-check', auth: 'cron-secret', suite: 'cron' },
	{ method: 'GET', path: '/cron/auth/expired-proposals-check', auth: 'cron-secret', suite: 'cron' },
	{ method: 'GET', path: '/cron/auth/sync-transactions', auth: 'cron-secret', suite: 'cron' },
	{ method: 'GET', path: '/favorites/auth/check/:item_id', auth: 'access-refresh-cookie', suite: 'favorites' },
	{ method: 'POST', path: '/favorites/auth/handle', auth: 'access-refresh-cookie', suite: 'favorites' },
	{ method: 'GET', path: '/item/:id', auth: 'optional-access-refresh-cookie', suite: 'items' },
	{ method: 'POST', path: '/item/auth/buy_now', auth: 'access-refresh-cookie', suite: 'items' },
	{ method: 'POST', path: '/item/auth/new', auth: 'access-refresh-cookie', suite: 'items' },
	{ method: 'POST', path: '/item/auth/publish_state', auth: 'access-refresh-cookie', suite: 'items' },
	{ method: 'POST', path: '/item/auth/user_delete_item', auth: 'access-refresh-cookie', suite: 'items' },
	{ method: 'PUT', path: '/item/auth/edit/:id', auth: 'access-refresh-cookie', suite: 'items' },
	{ method: 'GET', path: '/items/:username', auth: 'public', suite: 'items' },
	{ method: 'GET', path: '/items/auth/user/favorites', auth: 'access-refresh-cookie', suite: 'items' },
	{ method: 'POST', path: '/items/auth/user/selling_items', auth: 'access-refresh-cookie', suite: 'items' },
	{ method: 'GET', path: '/locations/search', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/locations/search_by_id/:locationType/:locationId', auth: 'public', suite: 'catalog' },
	{ method: 'POST', path: '/login', auth: 'public', suite: 'authentication' },
	{ method: 'POST', path: '/logout/auth', auth: 'refresh-cookie', suite: 'authentication' },
	{ method: 'GET', path: '/orders/auth/:id', auth: 'access-refresh-cookie', suite: 'orders' },
	{ method: 'GET', path: '/orders/auth/status/:status', auth: 'access-refresh-cookie', suite: 'orders' },
	{ method: 'GET', path: '/orders_proposals/auth/:id', auth: 'access-refresh-cookie', suite: 'proposals' },
	{ method: 'GET', path: '/orders_proposals/auth/by_item/:item_id', auth: 'access-refresh-cookie', suite: 'proposals' },
	{
		method: 'POST',
		path: '/orders_proposals/auth/buyer_aborted_proposal',
		auth: 'access-refresh-cookie',
		suite: 'proposals',
	},
	{ method: 'POST', path: '/orders_proposals/auth/create', auth: 'access-refresh-cookie', suite: 'proposals' },
	{ method: 'PUT', path: '/orders_proposals/auth', auth: 'access-refresh-cookie', suite: 'proposals' },
	{ method: 'GET', path: '/password/auth/reset-verify-token', auth: 'public', suite: 'authentication' },
	{ method: 'POST', path: '/password/auth/reset', auth: 'public', suite: 'authentication' },
	{ method: 'POST', path: '/password/forgot-password', auth: 'public', suite: 'authentication' },
	{
		method: 'POST',
		path: '/platforms_costs/auth/calculate_platform_costs',
		auth: 'access-refresh-cookie',
		suite: 'platform-costs',
	},
	{ method: 'GET', path: '/profile/auth', auth: 'access-refresh-cookie', suite: 'profiles' },
	{ method: 'GET', path: '/profile/auth/profile_active_address_id', auth: 'access-refresh-cookie', suite: 'profiles' },
	{ method: 'GET', path: '/profile/compact/:username', auth: 'public', suite: 'profiles' },
	{ method: 'PUT', path: '/profile/auth', auth: 'access-refresh-cookie', suite: 'profiles' },
	{ method: 'GET', path: '/properties/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/properties/subcategory_properties/:id', auth: 'public', suite: 'catalog' },
	{ method: 'POST', path: '/refresh/auth', auth: 'refresh-cookie', suite: 'authentication' },
	{ method: 'GET', path: '/shipment_provider/auth/active_carriers', auth: 'access-refresh-cookie', suite: 'shipping' },
	{
		method: 'POST',
		path: '/shipment_provider/auth/calculate_shipment_cost',
		auth: 'access-refresh-cookie',
		suite: 'shipping',
	},
	{ method: 'POST', path: '/shipment_provider/auth/create_label', auth: 'access-refresh-cookie', suite: 'shipping' },
	{ method: 'POST', path: '/signup', auth: 'public', suite: 'authentication' },
	{ method: 'GET', path: '/subcategories', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategories/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategories/no_parent/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategory_properties/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategory_properties/filter/:id', auth: 'public', suite: 'catalog' },
	{ method: 'POST', path: '/uploads/auth/images-item', auth: 'access-refresh-cookie', suite: 'uploads' },
	{ method: 'GET', path: '/user/auth', auth: 'access-refresh-cookie', suite: 'authentication' },
	{ method: 'GET', path: '/verify', auth: 'access-refresh-cookie', suite: 'authentication' },
	{ method: 'GET', path: '/verify/email', auth: 'public', suite: 'authentication' },
	{ method: 'POST', path: '/webhooks/trustap/transaction-update', auth: 'webhook-basic', suite: 'webhooks' },
] as const satisfies readonly RouteContract[];
