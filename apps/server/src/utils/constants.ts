import { parseEnv, type Environment } from '../env';

export const authPath = 'auth';
export const cronPath = 'cron';

export const DEFAULT_ACCESS_TOKEN_EXPIRES = () => new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

export const DEFAULT_REFRESH_TOKEN_EXPIRES = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

export const DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES = () => new Date(Date.now() + 60 * 60 * 1000); // 60 minutes from now

export const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS = () => Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours in seconds

export const DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS = () => Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days in seconds

export const DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES_IN_MS = () => Math.floor(Date.now() / 1000) + 60 * 60; // 60 minutes in seconds

export const STRIPE_ACTIVE_ACCOUNT_FIXED_COST = 2;
export const STRIPE_PAYMENT_PERCENTAGE_PROCESSING_COST = 0.0025;
export const STRIPE_PAYMENT_FIXED_PROCESSING_COST = 0.1;

export const stripePaymentProcessingCost = (amountInEuros: number) =>
	STRIPE_PAYMENT_PERCENTAGE_PROCESSING_COST * amountInEuros +
	STRIPE_PAYMENT_FIXED_PROCESSING_COST +
	STRIPE_ACTIVE_ACCOUNT_FIXED_COST;

export const STRIPE_MINIMUM_TRANSACTION_AMOUNT = 10;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_100_EUR = 6;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_200_EUR = 5;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_500_EUR = 4.5;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_1000_EUR = 4;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_2000_EUR = 3.5;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_5000_EUR = 3;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_10000_EUR = 2;
export const STRIPE_APPLICATION_FEE_PERCENTAGE_20000_EUR = 2;

export function getNodeEnvMode(env: string) {
	return {
		isDevelopmentMode: env === 'development',
		isTestMode: env === 'test',
		isStagingMode: env === 'staging',
		isProductionMode: env === 'production',
	};
}

const env = parseEnv(process.env);

export const environment: Environment = {
	NODE_ENV: env.NODE_ENV,
	LOG_LEVEL: env.LOG_LEVEL,

	STOREFRONT_HOSTNAME: env.STOREFRONT_HOSTNAME,
	STOREFRONT_PORT: env.STOREFRONT_PORT,
	SERVER_HOSTNAME: env.SERVER_HOSTNAME,
	SERVER_PORT: env.SERVER_PORT,

	POSTGRES_USER: env.POSTGRES_USER,
	POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
	DATABASE_HOST: env.DATABASE_HOST,
	DATABASE_PORT: env.DATABASE_PORT,
	POSTGRES_DB: env.POSTGRES_DB,

	STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
	STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,

	AWS_REGION: env.AWS_REGION,
	AWS_BUCKET_NAME: env.AWS_BUCKET_NAME,
	AWS_ACCESS_KEY: env.AWS_ACCESS_KEY,
	AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,

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
