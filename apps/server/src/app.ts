import "dotenv/config";

import {
  itemsRoute,
  loginRoute,
  signupRoute,
  verifyRoute,
  refreshRoute,
  logoutRoute,
  meRoute,
  profileRoute,
  passwordForgotRoute,
  passwordResetRoute,
  passwordResetVerifyToken,
} from "./routes";
import createApp from "@/lib/create-app";
import configureOpenAPI from "./lib/configureOpenApi";
import { authPath } from "./lib/constants";

const app = createApp();

configureOpenAPI(app);

const apiRoutes = app
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/verify", verifyRoute)
  .route("/items", itemsRoute)
  .route("/password", passwordForgotRoute)
  .route(`/${authPath}/logout`, logoutRoute)
  .route(`/${authPath}/me`, meRoute)
  .route(`/${authPath}/refresh`, refreshRoute)
  .route(`/${authPath}/password`, passwordResetRoute)
  .route(`/${authPath}/password`, passwordResetVerifyToken)
  .route(`/${authPath}/profile`, profileRoute);

export type ApiRoutes = typeof apiRoutes;

export default app;
