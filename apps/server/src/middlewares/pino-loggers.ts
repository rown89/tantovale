import { pinoLogger as createPinoLogger } from 'hono-pino';
import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import pretty from 'pino-pretty';

import { environment } from '#utils/constants';

const sensitiveHeaderNames = new Set(['authorization', 'cookie', 'set-cookie']);

function withoutSensitiveHeaders(value: unknown, seen = new WeakSet<object>()): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (value instanceof Date) return value;
	if (seen.has(value)) return '[Circular]';
	seen.add(value);

	if (Array.isArray(value)) return value.map((entry) => withoutSensitiveHeaders(entry, seen));
	if (value instanceof Error) {
		return {
			type: value.name,
			message: value.message,
			stack: value.stack,
			...Object.fromEntries(
				Object.entries(value)
					.filter(([key]) => !sensitiveHeaderNames.has(key.toLowerCase()))
					.map(([key, entry]) => [key, withoutSensitiveHeaders(entry, seen)]),
			),
		};
	}

	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !sensitiveHeaderNames.has(key.toLowerCase()))
			.map(([key, entry]) => [key, withoutSensitiveHeaders(entry, seen)]),
	);
}

function safeLoggerOptions(level: LoggerOptions['level']): LoggerOptions {
	return {
		level,
		redact: {
			paths: ['req.headers', 'res.headers', 'request.headers', 'response.headers', '*.req.headers', '*.res.headers'],
			remove: true,
		},
		hooks: {
			logMethod(args, method) {
				const safeArgs = args.map((argument) => withoutSensitiveHeaders(argument));
				return Reflect.apply(method, this, safeArgs);
			},
		},
	};
}

export function pinoLogger(options: { destination?: DestinationStream; level?: LoggerOptions['level'] } = {}) {
	const destination = options.destination ?? (environment.NODE_ENV === 'production' ? undefined : pretty());
	return createPinoLogger({
		pino: pino(safeLoggerOptions(options.level ?? environment.LOG_LEVEL ?? 'info'), destination),
		http: {
			referRequestIdKey: 'requestId',
			onReqBindings: (c) => ({
				req: { method: c.req.method, path: c.req.path },
			}),
			onResBindings: (c) => ({ res: { status: c.res.status } }),
			onResMessage: (c) => (c.error ? 'Request failed' : 'Request completed'),
		},
	});
}
