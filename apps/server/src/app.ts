import { createApp } from './lib/create-app';
import { configureOpenAPI } from './lib/configureOpenApi';
import { serveStatic } from '@hono/node-server/serve-static';

import {
	itemsRoute,
	loginRoute,
	signupRoute,
	refreshRoute,
	logoutRoute,
	profileRoute,
	passwordForgotRoute,
	passwordResetRoute,
	passwordResetVerifyToken,
	verifyRoute,
	itemRoute,
	subcategoriesRoute,
	subcategoryPropertiesRoute,
	categoriesRoute,
	propertiesRoute,
	uploadsRoute,
	locationsRoute,
	chatRoute,
	userRoute,
	favoritesRoute,
	webhooksRoute,
	ordersProposalsRoute,
	ordersRoute,
} from './routes';

const app = createApp();

// OpenApi specs
configureOpenAPI(app);

// Serve static files
app.use('/*', serveStatic({ root: './dist' }));

const apiRoutes = app
	.route(`/categories`, categoriesRoute)
	.route(`/chat`, chatRoute)
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
