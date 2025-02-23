/**
 * Builds the Cookie header from the access and refresh tokens.
 */
export function buildCookieHeader(
  accessToken?: string,
  refreshToken?: string,
): string {
  return `access_token=${accessToken || ""}; refresh_token=${refreshToken || ""}`;
}
