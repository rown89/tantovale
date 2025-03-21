import "dotenv/config";

import { handle, type LambdaContext, type LambdaEvent } from "hono/aws-lambda";
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
  itemRoute,
  subcategoriesRoute,
  subcategoryFiltersRoute,
  categoriesRoute,
  filtersRoute,
  uploadsRoute,
} from "./routes";

const app = createApp();

configureOpenAPI(app); // initiate OpenApi specs

const apiRoutes = app
  .route("/signup", signupRoute)
  .route("/login", loginRoute)
  .route("/verify", verifyEmailRoute)
  .route(`/verify`, verifyRoute)
  .route("/items", itemsRoute)
  .route("/categories", categoriesRoute)
  .route("/filters", filtersRoute)
  .route("/subcategories", subcategoriesRoute)
  .route("/subcategory_fitlers", subcategoryFiltersRoute)
  .route("/password", passwordForgotRoute)
  .route(`/item`, itemRoute)
  .route(`/${authPath}/uploads`, uploadsRoute)
  .route(`/${authPath}/item`, itemRoute)
  .route(`/${authPath}/logout`, logoutRoute)
  .route(`/${authPath}/refresh`, refreshRoute)
  .route(`/${authPath}/password`, passwordResetRoute)
  .route(`/${authPath}/password`, passwordResetVerifyToken)
  .route(`/${authPath}/profile`, profileRoute);

export const handler = async (
  event: LambdaEvent,
  lambdaContext: LambdaContext,
) => {
  try {
    // console.log("Lambda event:", JSON.stringify(event, null, 2));
    //  console.log("Lambda context:", lambdaContext);

    // Ensure the app is properly invoked
    const response = await handle(app)(event, lambdaContext);

    // Manually add cookies to the headers if needed
    if (response.cookies) {
      response.headers = {
        ...response.headers,
        "Set-Cookie": response.cookies.join(", "),
      };
    }

    console.log(":: RESPONSE COOKIES: ", response.cookies);

    return {
      cookies: [response.cookies ? response.cookies.join(", ") : ""],
      ...response,
    };
  } catch (error) {
    console.error("Error handling Lambda request:", error);

    // Return a proper error response
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Set-cookie": "asd",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "Aws lambda Internal Server Error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};

export type ApiRoutesType = typeof apiRoutes;

export { app };
