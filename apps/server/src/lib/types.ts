import type { Hono } from 'hono';
import type { PinoLogger } from 'hono-pino';
import type { Environment } from '../env';

export interface AppBindings {
	Bindings: Environment;
	Variables: {
		user: {
			id: number;
			email: string;
			username: string;
			email_verified: boolean;
			phone_verified: boolean;
		};
		logger: PinoLogger;
	};
}

export type AppAPI = Hono<AppBindings>;
