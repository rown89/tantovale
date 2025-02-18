import type { CookieOptions } from "hono/utils/cookie";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES,
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  isProductionMode,
} from "./constants";

export function getTokenOptions(name: string, expires?: Date): CookieOptions {
  if (name === "access_token") {
    expires = DEFAULT_ACCESS_TOKEN_EXPIRES;
  } else {
    expires = DEFAULT_REFRESH_TOKEN_EXPIRES;
  }

  const maxAge = 1000;

  // Cookie options with environment-specific settings
  const cookiesOptions: CookieOptions = {
    secure: isProductionMode, // Use secure cookies only in production
    httpOnly: true, // Use httpOnly cookies in production for security
    sameSite: "strict", // Allow cookies cross-origin in dev
    maxAge,
    expires,
    path: "/",
    // TODO : EDIT THIS
    domain: isProductionMode ? "tantovale.it" : undefined,
  };

  return cookiesOptions;
}
