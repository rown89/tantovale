import { pinoLogger as createPinoLogger } from 'hono-pino';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pretty from 'pino-pretty';

import { environment } from '#utils/constants';

export function pinoLogger() {
	return createPinoLogger({
		pino: pino(
			{
				level: environment.LOG_LEVEL || 'info',
			},
			environment.NODE_ENV === 'production' ? undefined : pretty(),
		),
		http: {
			reqId: () => randomUUID(),
		},
	});
}
