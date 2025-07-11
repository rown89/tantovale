import type { Hono } from 'hono';
import type { PinoLogger } from 'hono-pino';
import type { Environment } from '../env';

export interface User {
	id: number;
	profile_id: number;
	email: string;
	username: string;
	email_verified: boolean;
	phone_verified: boolean;
}

export interface AppBindings {
	Bindings: Environment;
	Variables: {
		user: User;
		logger: PinoLogger;
	};
}

export type AppAPI = Hono<AppBindings>;
