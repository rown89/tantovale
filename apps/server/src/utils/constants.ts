export const authPath = "auth";

export const isDevelopmentMode =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
export const isStagingMode = (process.env.NODE_ENV as string) === "staging";
export const isProductionMode = process.env.NODE_ENV === "production";

export const DEFAULT_ACCESS_TOKEN_EXPIRES = new Date(
  Date.now() + 24 * 60 * 60 * 1000,
); // 24 hours from now

export const DEFAULT_REFRESH_TOKEN_EXPIRES = new Date(
  Date.now() + 7 * 24 * 60 * 60 * 1000,
); // 7 days from now

export const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS =
  Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours in seconds
export const DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS =
  Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days in seconds
