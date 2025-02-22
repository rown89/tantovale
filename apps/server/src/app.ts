import "dotenv/config";

import { createApp } from "@/lib/create-app";
import { configureOpenAPI } from "./lib/configureOpenApi";
import { authPath } from "./utils/constants";
import { verifyRoute } from "./routes/verify";

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
  verifyEmailRoute,
} from "./routes";
import { hc } from "hono/client";

const app = createApp();

// initiate OpenApi specs
configureOpenAPI(app);

const apiRoutes = app
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/verify", verifyEmailRoute)
  .route("/items", itemsRoute)
  .route("/password", passwordForgotRoute)
  .route(`/${authPath}/verify`, verifyRoute)
  .route(`/${authPath}/logout`, logoutRoute)
  .route(`/${authPath}/refresh`, refreshRoute)
  .route(`/${authPath}/password`, passwordResetRoute)
  .route(`/${authPath}/password`, passwordResetVerifyToken)
  .route(`/${authPath}/profile`, profileRoute);

export type ApiRoutesType = typeof apiRoutes;
export default app;
