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
  verifyEmailRoute,
} from "./routes";

import { seedDatabase } from "#database/scripts/seeders/categories/seeder";

const app = createApp();

// initiate OpenApi specs
configureOpenAPI(app);

const apiRoutes = app
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/verify", verifyEmailRoute)
  .route(`/verify`, verifyRoute)
  .route("/items", itemsRoute)
  .route("/password", passwordForgotRoute)
  .route(`/${authPath}/logout`, logoutRoute)
  .route(`/${authPath}/refresh`, refreshRoute)
  .route(`/${authPath}/password`, passwordResetRoute)
  .route(`/${authPath}/password`, passwordResetVerifyToken)
  .route(`/${authPath}/profile`, profileRoute);

export type ApiRoutesType = typeof apiRoutes;
export default app;
