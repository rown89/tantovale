import { pinoLogger as createPinoLogger } from 'hono-pino';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pretty from 'pino-pretty';

import { parseEnv } from '../env';

export function pinoLogger() {
	return createPinoLogger({
		pino: pino(
			{
				level: parseEnv(process.env).LOG_LEVEL || 'info',
			},
			parseEnv(process.env).NODE_ENV === 'production' ? undefined : pretty(),
		),
		http: {
			reqId: () => randomUUID(),
		},
	});
}
