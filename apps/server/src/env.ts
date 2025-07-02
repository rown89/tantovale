/* eslint-disable node/no-process-env */
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import path from 'path';
import { z } from 'zod/v4';

// Load .env first
expand(
	config({
		path: path.resolve(process.cwd(), '.env'),
	}),
);

// In development, also load .env.local which will override .env values
// Check the initial NODE_ENV, not the one potentially set by .env file
if (process.env.NODE_ENV === 'development') {
	expand(
		config({
			path: path.resolve(process.cwd(), '.env.local'),
			override: true,
		}),
	);
}

const EnvSchema = z.object({
	PROJECT_NAME: z.string().default('Tantovale'),
	NODE_ENV: z.string().default('development'),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
	NEXT_PUBLIC_HONO_API_URL: z.string().default('http://localhost:4000'),
	// SERVER
	SERVER_HOSTNAME: z.string().default('localhost'),
	SERVER_PORT: z.coerce.number().default(4000),
	// STOREFRONT
	STOREFRONT_HOSTNAME: z.string().default('localhost'),
	STOREFRONT_PORT: z.coerce.number().default(3000),
	// DATABASE
	POSTGRES_USER: z.string(),
	POSTGRES_PASSWORD: z.string(),
	DATABASE_HOST: z.string(),
	POSTGRES_DB: z.string(),
	DATABASE_PORT: z.coerce.number().default(5432),
	// PAYMENT PROVIDER
	PAYMENT_PROVIDER_API_URL: z.string(),
	PAYMENT_PROVIDER_API_VERSION: z.string(),
	PAYMENT_PROVIDER_API_KEY: z.string(),
	PAYMENT_PROVIDER_CLIENT_ID: z.string(),
	PAYMENT_PROVIDER_CLIENT_SECRET: z.string(),
	PAYMENT_PROVIDER_WEBHOOK_SECRET: z.string(),
	PAYMENT_PROVIDER_PAY_PAGE_URL: z.string(),
	POST_PAYMENT_REDIRECT_URL: z.string(),
	// SHIPPPING
	SHIPPING_PROVIDER_API_KEY: z.string(),
	SHIPPING_PROVIDER_WEBHOOK_SECRET: z.string(),
	// AUTH
	ACCESS_TOKEN_SECRET: z.string(),
	REFRESH_TOKEN_SECRET: z.string(),
	EMAIL_VERIFY_TOKEN_SECRET: z.string(),
	RESET_TOKEN_SECRET: z.string(),
	COOKIE_SECRET: z.string(),
	// AWS
	AWS_REGION: z.string(),
	AWS_ACCESS_KEY: z.string(),
	AWS_BUCKET_NAME: z.string(),
	AWS_SECRET_ACCESS_KEY: z.string(),
	// SMTP
	SMTP_HOST: z.string(),
	SMTP_PORT: z.coerce.number().default(465),
	SMTP_USER: z.string(),
	SMTP_PASS: z.string(),
	// CRON
	DAILY_ORDER_CHECK_SECRET_KEY: z.string(),
	DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY: z.string(),
	TRANSACTIONS_SYNC_SECRET_KEY: z.string(),
	// TOLLERANCES
	PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS: z.coerce.number().default(96),
	ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS: z.coerce.number().default(48),
});

export function parseEnv(data: z.infer<typeof EnvSchema> | NodeJS.ProcessEnv) {
	const { data: env, error } = EnvSchema.safeParse(data);

	if (error) {
		const errorMessage = `❌ Invalid env - ${Object.entries(error.flatten().fieldErrors)
			.map(([key, errors]) => `${key}: ${errors.join(',')}`)
			.join(' | ')}`;
		throw new Error(errorMessage);
	}

	return env;
}

export type Environment = z.infer<typeof EnvSchema>;
