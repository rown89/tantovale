import "dotenv/config";

import { createApp } from "#lib/create-app";
import { configureOpenAPI } from "#lib/configureOpenApi";
import { authPath } from "#utils/constants";

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
} from "./routes";

const app = createApp();

// OpenApi specs
configureOpenAPI(app);

const apiRoutes = app
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route(`/verify`, verifyRoute)
  .route("/items", itemsRoute)
  .route("/categories", categoriesRoute)
  .route("/cities", citiesRoute)
  .route("/filters", filtersRoute)
  .route("/subcategories", subcategoriesRoute)
  .route("/subcategory_fitlers", subcategoryFiltersRoute)
  .route("/password", passwordForgotRoute)
  .route(`/${authPath}/uploads`, uploadsRoute)
  .route(`/${authPath}/item`, itemRoute)
  .route(`/${authPath}/logout`, logoutRoute)
  .route(`/${authPath}/refresh`, refreshRoute)
  .route(`/${authPath}/password`, passwordResetRoute)
  .route(`/${authPath}/password`, passwordResetVerifyToken)
  .route(`/${authPath}/profile`, profileRoute);

export { app };
export type ApiRoutesType = typeof apiRoutes;
