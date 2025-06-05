import { createApp } from './lib/create-app';
import { configureOpenAPI } from './lib/configureOpenApi';
import { serveStatic } from '@hono/node-server/serve-static';

import {
	addressesRoute,
	categoriesRoute,
	chatRoute,
	cronRoute,
	favoritesRoute,
	itemRoute,
	itemsRoute,
	locationsRoute,
	loginRoute,
	logoutRoute,
	ordersProposalsRoute,
	ordersRoute,
	passwordForgotRoute,
	passwordResetRoute,
	passwordResetVerifyToken,
	profileRoute,
	propertiesRoute,
	refreshRoute,
	signupRoute,
	subcategoriesRoute,
	subcategoryPropertiesRoute,
	uploadsRoute,
	userRoute,
	verifyRoute,
	webhooksRoute,
} from './routes';

const app = createApp();

// OpenApi specs
configureOpenAPI(app);

// Serve static files
app.use('/*', serveStatic({ root: './dist' }));

const apiRoutes = app
	.route(`/addresses`, addressesRoute)
	.route(`/categories`, categoriesRoute)
	.route(`/chat`, chatRoute)
	.route(`/cron`, cronRoute)
	.route(`/favorites`, favoritesRoute)
	.route(`/item`, itemRoute)
	.route(`/items`, itemsRoute)
	.route(`/locations`, locationsRoute)
	.route(`/login`, loginRoute)
	.route(`/logout`, logoutRoute)
	.route(`/orders`, ordersRoute)
	.route(`/orders_proposals`, ordersProposalsRoute)
	.route(`/password`, passwordForgotRoute)
	.route(`/password`, passwordResetRoute)
	.route(`/password`, passwordResetVerifyToken)
	.route(`/profile`, profileRoute)
	.route(`/properties`, propertiesRoute)
	.route(`/refresh`, refreshRoute)
	.route(`/signup`, signupRoute)
	.route(`/subcategories`, subcategoriesRoute)
	.route(`/subcategory_properties`, subcategoryPropertiesRoute)
	.route(`/uploads`, uploadsRoute)
	.route(`/user`, userRoute)
	.route(`/verify`, verifyRoute)
	.route(`/webhooks`, webhooksRoute);

export { app };
export type ApiRoutesType = typeof apiRoutes;
