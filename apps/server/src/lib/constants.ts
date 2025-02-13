import "dotenv/config";

export const isDevelopmentMode =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
export const isStagingMode = (process.env.NODE_ENV as string) === "staging";
export const isProductionMode = process.env.NODE_ENV === "production";

export const serverUrl = `${isDevelopmentMode ? "http" : "https"}://${process.env.SERVER_HOSTNAME}:${process.env.SERVER_PORT}`;
export const serverVersion = process.env.SERVER_VERSION ?? "v1";

export const DEFAULT_ACCESS_TOKEN_EXPIRES = 60 * 60; // 1 hour (in seconds)
export const DEFAULT_REFRESH_TOKEN_EXPIRES = 30 * 24 * 60 * 60; // 30 days (in seconds)
