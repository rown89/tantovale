import { createApp } from './lib/create-app';
import { configureOpenAPI } from './lib/configureOpenApi';

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
	subcategoryFiltersRoute,
	categoriesRoute,
	filtersRoute,
	uploadsRoute,
	citiesRoute,
	chatRoute,
	userRoute,
	favoritesRoute,
} from './routes';

const app = createApp();

// OpenApi specs
configureOpenAPI(app);

const apiRoutes = app
	.route(`/signup`, signupRoute)
	.route(`/login`, loginRoute)
	.route(`/verify`, verifyRoute)
	.route(`/item`, itemRoute)
	.route(`/items`, itemsRoute)
	.route(`/categories`, categoriesRoute)
	.route(`/cities`, citiesRoute)
	.route(`/filters`, filtersRoute)
	.route(`/subcategories`, subcategoriesRoute)
	.route(`/subcategory_fitlers`, subcategoryFiltersRoute)
	.route(`/uploads`, uploadsRoute)
	.route(`/chat`, chatRoute)
	.route(`/logout`, logoutRoute)
	.route(`/refresh`, refreshRoute)
	.route(`/password`, passwordForgotRoute)
	.route(`/password`, passwordResetRoute)
	.route(`/password`, passwordResetVerifyToken)
	.route(`/profile`, profileRoute)
	.route(`/favorites`, favoritesRoute)
	.route(`/user`, userRoute);

export { app };
export type ApiRoutesType = typeof apiRoutes;
