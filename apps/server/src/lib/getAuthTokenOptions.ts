import type { CookieOptions } from "hono/utils/cookie";

export function getAuthTokenOptions({
  isProductionMode,
  expires,
}: {
  isProductionMode?: boolean;
  expires: Date;
}): CookieOptions {
  // Cookie options with environment-specific settings
  const cookiesOptions: CookieOptions = {
    secure: true, // Always use secure in modern browsers
    httpOnly: true,
    sameSite: "None", // Required for cross-domain requests
    maxAge: 24 * 60 * 60, // 24 hours in seconds
    expires,
    path: "/",
    domain: isProductionMode ? "tantovale.it" : undefined,
  };

  return cookiesOptions;
}
