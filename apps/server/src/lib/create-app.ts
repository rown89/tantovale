import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { authPath } from '../utils/constants';
import { notFound, onError, serveEmojiFavicon } from 'stoker/middlewares';
import { pinoLogger } from '../middlewares/pino-loggers';
import { authMiddleware } from '../middlewares/authMiddleware';
import { parseEnv } from '../env';

import type { AppBindings } from './types';

export function createRouter() {
	return new Hono<AppBindings>();
}

export function createApp() {
	const app = createRouter();

	app.use((c, next) => {
		c.env = parseEnv(Object.assign(c.env || {}, process.env));
		return next();
	});

	const allowedOrigins = ['http://localhost:3000', process.env.NEXT_PUBLIC_HONO_API_URL, 'https://tantovale.it']
		.filter(Boolean)
		// Remove trailing slashes
		.map((origin) => origin?.replace(/\/$/, ''));

	app.use(
		'*',
		cors({
			origin: (origin) => {
				const normalizedOrigin = origin?.replace(/\/$/, '');
				return allowedOrigins.includes(normalizedOrigin || '') ? normalizedOrigin : allowedOrigins[0];
			},
			credentials: true,
			allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
			allowHeaders: ['Origin', 'set-cookie', 'Content-Type', 'X-Requested-With', 'Accept', 'Authorization'],
			exposeHeaders: ['Content-Length'],
			maxAge: 600,
		}),
	);

	app.use(requestId()).use(serveEmojiFavicon('📝')).use(pinoLogger());

	app.notFound(notFound);
	app.onError(onError);

	// paths that require authorization starts with authPath
	// app.use(`/${authPath}/*`, authMiddleware);

	// Apply authMiddleware to any route containing authPath
	app.use((c, next) => {
		if (c.req.path.includes(authPath)) {
			return authMiddleware(c, next);
		}
		return next();
	});

	return app;
}
