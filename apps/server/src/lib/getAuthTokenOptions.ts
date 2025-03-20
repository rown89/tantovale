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
    secure: true, // Ensure this is true for HTTPS
    httpOnly: true,
    sameSite: "None", // Ensure this is "None" for cross-site requests
    maxAge: 24 * 60 * 60, // 24 hours in seconds
    expires,
    path: "/", // Ensure path is set to "/"
    // domain: isProductionMode ? "tantovale.it" : undefined, // Ensure domain is correct
  };

  return cookiesOptions;
}
