import type { CookieOptions } from "hono/utils/cookie";

export function getAuthTokenOptions({
  isProductionMode,
  expires,
}: {
  isProductionMode?: boolean;
  expires: Date;
}): CookieOptions {
  const maxAge = 1000;

  // Cookie options with environment-specific settings
  const cookiesOptions: CookieOptions = {
    secure: true, // isProductionMode,
    httpOnly: true, // isProductionMode ? true : false,
    sameSite: "None", // isProductionMode ? "None" : "Lax",
    maxAge,
    expires,
    path: "/",
    domain: isProductionMode ? ".tantovale.it" : "localhost",
  };

  return cookiesOptions;
}
