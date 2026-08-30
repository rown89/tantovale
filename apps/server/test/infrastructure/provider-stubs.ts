import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import {
	shippoCarrierAccountsFixture,
	shippoShipmentFixture,
	shippoTransactionFixture,
} from '../fixtures/providers/shippo-2018-02-08';
import {
	trustapChargeFixture,
	trustapGuestUserFixture,
	trustapTransactionFixture,
} from '../fixtures/providers/trustap-v1';

export type ProviderStubKind = 'trustap' | 'shippo';
export type StubScenario = 'success' | 'unauthorized' | 'invalid-payload' | 'provider-error';
export type CapturedRequest = {
	method: string;
	path: string;
	headers: Record<string, string>;
	body: unknown;
};
export type StartedProviderStub = {
	url: string;
	close: () => Promise<void>;
};

const JSON_BODY_LIMIT_BYTES = 64 * 1024;
const scenarios: ReadonlySet<StubScenario> = new Set(['success', 'unauthorized', 'invalid-payload', 'provider-error']);

class RequestBodyTooLargeError extends Error {}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

function normalizeHeaders(request: IncomingMessage): Record<string, string> {
	return Object.fromEntries(
		Object.entries(request.headers).flatMap(([name, value]) => {
			if (value === undefined) return [];
			return [[name.toLowerCase(), Array.isArray(value) ? value.join(', ') : value]];
		}),
	);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
	let byteLength = 0;
	const chunks: Buffer[] = [];

	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
		byteLength += buffer.byteLength;
		if (byteLength > JSON_BODY_LIMIT_BYTES) {
			throw new RequestBodyTooLargeError('JSON body exceeds the local provider stub limit');
		}
		chunks.push(buffer);
	}

	if (chunks.length === 0) return undefined;
	return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function isLocalControlRequest(request: IncomingMessage): boolean {
	return request.socket.remoteAddress === '127.0.0.1' || request.socket.remoteAddress === '::ffff:127.0.0.1';
}

function scenarioResponse(response: ServerResponse, scenario: StubScenario): boolean {
	switch (scenario) {
		case 'success':
			return false;
		case 'unauthorized':
			sendJson(response, 401, { error: 'Provider authentication failed' });
			return true;
		case 'invalid-payload':
			sendJson(response, 422, { error: 'Provider rejected the payload' });
			return true;
		case 'provider-error':
			sendJson(response, 500, { error: 'Provider service error' });
			return true;
	}
}

function sendSuccess(kind: ProviderStubKind, method: string, pathname: string, response: ServerResponse): void {
	if (kind === 'trustap') {
		if (method === 'POST' && pathname === '/api/v1/guest_users') {
			sendJson(response, 201, trustapGuestUserFixture);
			return;
		}
		if (method === 'GET' && pathname === '/api/v1/charge') {
			sendJson(response, 200, trustapChargeFixture);
			return;
		}
		if (method === 'POST' && pathname === '/api/v1/me/transactions/create_with_guest_user') {
			sendJson(response, 201, trustapTransactionFixture);
			return;
		}
		if (method === 'GET' && pathname === '/api/v1/transactions/91001') {
			sendJson(response, 200, trustapTransactionFixture);
			return;
		}
	} else {
		if (method === 'GET' && pathname === '/carrier_accounts') {
			sendJson(response, 200, shippoCarrierAccountsFixture);
			return;
		}
		if (method === 'POST' && pathname === '/shipments') {
			sendJson(response, 201, shippoShipmentFixture);
			return;
		}
		if (method === 'GET' && pathname === '/shipments/shipment-test') {
			sendJson(response, 200, shippoShipmentFixture);
			return;
		}
		if (method === 'POST' && pathname === '/transactions') {
			sendJson(response, 201, shippoTransactionFixture);
			return;
		}
	}

	sendJson(response, 404, { error: 'Provider stub route not found' });
}

export async function startProviderStub(kind: ProviderStubKind): Promise<StartedProviderStub> {
	let scenario: StubScenario = 'success';
	let requests: CapturedRequest[] = [];

	const server = createServer(async (request, response) => {
		try {
			const method = request.method ?? 'GET';
			const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

			if (requestUrl.pathname.startsWith('/__test/')) {
				if (!isLocalControlRequest(request)) {
					sendJson(response, 403, { error: 'Provider stub controls are local only' });
					return;
				}

				if (method === 'POST' && requestUrl.pathname === '/__test/reset') {
					requests = [];
					scenario = 'success';
					sendJson(response, 200, { ok: true });
					return;
				}

				if (method === 'POST' && requestUrl.pathname === '/__test/scenario') {
					const body = await readJsonBody(request);
					const nextScenario =
						typeof body === 'object' && body !== null && 'scenario' in body ? body.scenario : undefined;
					if (typeof nextScenario !== 'string' || !scenarios.has(nextScenario as StubScenario)) {
						sendJson(response, 400, { error: 'Unsupported provider stub scenario' });
						return;
					}
					scenario = nextScenario as StubScenario;
					sendJson(response, 200, { scenario });
					return;
				}

				if (method === 'GET' && requestUrl.pathname === '/__test/requests') {
					sendJson(response, 200, requests);
					return;
				}

				sendJson(response, 404, { error: 'Provider stub control route not found' });
				return;
			}

			const body = await readJsonBody(request);
			requests.push({
				method,
				path: `${requestUrl.pathname}${requestUrl.search}`,
				headers: normalizeHeaders(request),
				body,
			});

			if (!scenarioResponse(response, scenario)) {
				sendSuccess(kind, method, requestUrl.pathname, response);
			}
		} catch (error) {
			if (error instanceof RequestBodyTooLargeError) {
				sendJson(response, 413, { error: 'Provider stub JSON body is too large' });
				return;
			}
			if (error instanceof SyntaxError) {
				sendJson(response, 400, { error: 'Provider stub received malformed JSON' });
				return;
			}
			sendJson(response, 500, { error: 'Provider stub request failed' });
		}
	});

	await new Promise<void>((resolve, reject) => {
		const handleError = (error: Error) => {
			server.off('listening', handleListening);
			reject(error);
		};
		const handleListening = () => {
			server.off('error', handleError);
			resolve();
		};
		server.once('error', handleError);
		server.once('listening', handleListening);
		server.listen(0, '127.0.0.1');
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Local provider stub did not expose an IPv4 TCP address');
	}

	let closed = false;
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: async () => {
			if (closed) return;
			closed = true;
			server.closeIdleConnections();
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		},
	};
}
