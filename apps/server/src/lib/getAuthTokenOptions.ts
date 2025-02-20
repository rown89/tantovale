import type { CookieOptions } from "hono/utils/cookie";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES,
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  isProductionMode,
} from "./constants";

export function getAuthTokenOptions(
  name: string,
  expires?: Date,
): CookieOptions {
  if (!expires) {
    expires =
      name === "access_token"
        ? DEFAULT_ACCESS_TOKEN_EXPIRES
        : DEFAULT_REFRESH_TOKEN_EXPIRES;
  }

  const maxAge = 1000;

  // Cookie options with environment-specific settings
  const cookiesOptions: CookieOptions = {
    secure: isProductionMode,
    httpOnly: true,
    sameSite: isProductionMode ? "None" : "Lax",
    maxAge,
    expires,
    path: "/",
    domain: isProductionMode ? "tantovale.it" : undefined,
  };

  return cookiesOptions;
}
