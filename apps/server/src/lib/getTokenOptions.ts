import type { CookieOptions } from "hono/utils/cookie";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES,
  DEFAULT_REFRESH_TOKEN_EXPIRES,
  isDevelopmentMode,
  isProductionMode,
} from "./constants";

export function getTokenOptions(
  name: string,
  domain: string,
  expiresIn?: number,
): CookieOptions {
  let tokenExpiresIn: number;

  if (name === "access_token") {
    tokenExpiresIn = expiresIn ?? DEFAULT_ACCESS_TOKEN_EXPIRES;
  } else if (name === "refresh_token") {
    tokenExpiresIn = expiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRES;
    tokenExpiresIn = Math.min(tokenExpiresIn, DEFAULT_REFRESH_TOKEN_EXPIRES);
  } else {
    tokenExpiresIn = expiresIn ?? 60 * 60;
  }

  // Convert seconds to milliseconds
  const maxAge = tokenExpiresIn;
  const expires = new Date(Date.now() + maxAge);

  // Cookie options with environment-specific settings
  const cookiesOptions: CookieOptions = {
    secure: isProductionMode, // Use secure cookies only in production
    httpOnly: isProductionMode, // Use httpOnly cookies in production for security
    sameSite: isDevelopmentMode ? "lax" : "strict", // Allow cookies cross-origin in dev
    maxAge,
    expires,
    path: "/",
    ...(isProductionMode ? { domain } : {}),
  };

  return cookiesOptions;
}
