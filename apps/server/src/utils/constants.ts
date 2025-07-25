import { parseEnv, type Environment } from '../env';

const env = parseEnv(process.env);
export const environment: Environment = { ...env };

export const authPath = 'auth';
export const cronPath = 'cron';

export const DEFAULT_ACCESS_TOKEN_EXPIRES = () => new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

export const DEFAULT_REFRESH_TOKEN_EXPIRES = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

export const DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES = () => new Date(Date.now() + 60 * 60 * 1000); // 60 minutes from now

export const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS = () => Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours in seconds

export const DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS = () => Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days in seconds

export const DEFAULT_EMAIL_ACTIVATION_TOKEN_EXPIRES_IN_MS = () => Math.floor(Date.now() / 1000) + 60 * 60; // 60 minutes in seconds

export const SHIPPING_UNITS = {
	MASS: 'kg',
	DISTANCE: 'cm',
} as const;

export const SHIPPING_ERROR_MESSAGES = {
	SHIPPING_DIMENSIONS_NOT_FOUND: 'Shipping dimensions not found',
	SHIPPING_CALCULATION_FAILED: 'Failed to calculate shipping cost',
	SHIPPING_NOT_FOUND: 'Shipping not found',
	SHIPPING_LABEL_NOT_FOUND: 'Shipping label not found',
} as const;

export function getNodeEnvMode(env: string) {
	return {
		isDevelopmentMode: env === 'development',
		isTestMode: env === 'test',
		isStagingMode: env === 'staging',
		isProductionMode: env === 'production',
	};
}
