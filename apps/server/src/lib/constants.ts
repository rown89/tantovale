import "dotenv/config";

export const isDevelopmentMode = process.env.NODE_ENV === "development";
export const isStagingMode = (process.env.NODE_ENV as string) === "staging";
export const isProductionMode = process.env.NODE_ENV === "production";

export const serverUrl = `${isDevelopmentMode ? "http" : "https"}://${process.env.SERVER_HOSTNAME}:${process.env.SERVER_PORT}`;
export const serverVersion = process.env.SERVER_VERSION ?? "v1";
