import type { CookieOptions } from "hono/utils/cookie";

export function getAuthTokenOptions({
  isProductionMode,
  expires,
}: {
  isProductionMode?: boolean;
  expires: Date;
}): CookieOptions {
  const cookiesOptions: CookieOptions = {
    secure: true,
    httpOnly: true,
    sameSite: "None", // Ensure this is "None" for cross-site requests
    maxAge: 24 * 60 * 60, // 24 hours in seconds
    expires,
    path: "/",
    domain: isProductionMode ? "tantovale.it" : undefined, // Ensure domain is correct
  };

  return cookiesOptions;
}
