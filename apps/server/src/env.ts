/* eslint-disable node/no-process-env */
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import path from "node:path";
import { z } from "zod";

expand(
  config({
    path: path.resolve(
      process.cwd(),
      process.env.NODE_ENV === "test" ? ".env.test" : ".env",
    ),
  }),
);

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  STOREFRONT_HOSTNAME: z.string(),
  STOREFRONT_PORT: z.coerce.number().default(3000),
  ACCESS_TOKEN_SECRET: z.string(),
  REFRESH_TOKEN_SECRET: z.string(),
  EMAIL_VERIFY_TOKEN_SECRET: z.string(),
  RESET_TOKEN_SECRET: z.string(),
  COOKIE_SECRET: z.string(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  LOG_LEVEL: z.enum([
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "silent",
  ]),
  DATABASE_URL: z.string().url(),
});

export type Environment = z.infer<typeof EnvSchema>;

export function parseEnv(data: any) {
  const { data: env, error } = EnvSchema.safeParse(data);

  if (error) {
    const errorMessage = `❌ Invalid env - ${Object.entries(
      error.flatten().fieldErrors,
    )
      .map(([key, errors]) => `${key}: ${errors.join(",")}`)
      .join(" | ")}`;
    throw new Error(errorMessage);
  }

  return env;
}
