import { parseEnv, type Environment } from "#env";

export const authPath = "auth";

export const DEFAULT_ACCESS_TOKEN_EXPIRES = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

export const DEFAULT_REFRESH_TOKEN_EXPIRES = () =>
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

export const DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES = () =>
  new Date(Date.now() + 60 * 60 * 1000); // 60 minutes from now

export const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS = () =>
  Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours in seconds

export const DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS = () =>
  Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days in seconds

export const DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES_IN_MS = () =>
  Math.floor(Date.now() / 1000) + 60 * 60; // 60 minutes in seconds

export function getNodeEnvMode(env: string) {
  return {
    isDevelopmentMode: env === "development",
    isTestMode: env === "test",
    isStagingMode: env === "staging",
    isProductionMode: env === "production",
  };
}

const env = parseEnv(process.env);

export const environment: Environment = {
  NODE_ENV: env.NODE_ENV,
  LOG_LEVEL: env.LOG_LEVEL,

  DATABASE_USERNAME: env.DATABASE_USERNAME,
  DATABASE_PASSWORD: env.DATABASE_PASSWORD,
  DATABASE_HOST: env.DATABASE_HOST,
  DATABASE_PORT: env.DATABASE_PORT,
  DATABASE_NAME: env.DATABASE_NAME,

  ACCESS_TOKEN_SECRET: env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: env.REFRESH_TOKEN_SECRET,
  EMAIL_VERIFY_TOKEN_SECRET: env.EMAIL_VERIFY_TOKEN_SECRET,
  RESET_TOKEN_SECRET: env.RESET_TOKEN_SECRET,
  COOKIE_SECRET: env.COOKIE_SECRET,

  SMTP_HOST: env.SMTP_HOST,
  SMTP_PORT: env.SMTP_PORT,
  SMTP_USER: env.SMTP_USER,
  SMTP_PASS: env.SMTP_PASS,
};
