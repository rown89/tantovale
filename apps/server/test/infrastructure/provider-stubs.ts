import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DistanceUnitEnum, WeightUnitEnum } from 'shippo/models/components/index.js';

import {
	shippoCarrierAccountsFixture,
	shippoRateFixture,
	shippoShipmentFixture,
	shippoTransactionFixture,
} from '../fixtures/providers/shippo-2018-02-08';
import {
	trustapChargeFixture,
	trustapGuestUserFixture,
	trustapTransactionFixture,
} from '../fixtures/providers/trustap-v1';

export type ProviderStubKind = 'trustap' | 'shippo';
export type StubScenario =
	| 'success'
	| 'unauthorized'
	| 'invalid-payload'
	| 'unprocessable'
	| 'provider-error'
	| 'charge-error'
	| 'charge-delay'
	| 'charge-disconnect'
	| 'charge-malformed-json'
	| 'charge-price-mismatch'
	| 'charge-currency-mismatch'
	| 'charge-negative'
	| 'charge-overflow'
	| 'charge-version-invalid'
	| 'charge-seller-invalid'
	| 'guest-delay'
	| 'guest-timeout'
	| 'guest-disconnect-after-create'
	| 'guest-invalid-body'
	| 'guest-malformed-json'
	| 'shippo-delay'
	| 'shippo-disconnect'
	| 'shippo-carriers-invalid-body'
	| 'shippo-carriers-malformed-json'
	| 'shippo-carriers-delay'
	| 'shippo-carriers-disconnect'
	| 'shippo-carriers-empty'
	| 'shippo-shipment-invalid-body'
	| 'shippo-shipment-malformed-json'
	| 'shippo-shipment-disconnect'
	| 'shippo-rate-invalid-body'
	| 'shippo-rate-malformed-json'
	| 'shippo-rate-delay'
	| 'shippo-rate-disconnect'
	| 'shippo-rate-shipment-mismatch'
	| 'shippo-rate-id-mismatch'
	| 'shippo-rate-amount-mismatch'
	| 'shippo-rate-currency-mismatch'
	| 'shippo-label-invalid-body'
	| 'shippo-label-malformed-json'
	| 'shippo-label-delay'
	| 'shippo-label-disconnect'
	| 'shippo-label-status-error'
	| 'shippo-label-rate-mismatch'
	| 'shippo-label-without-tracking'
	| 'shippo-label-disconnect-after-create'
	| 'shippo-label-barrier'
	| 'shippo-reordered-rates'
	| 'shippo-address-mismatch'
	| 'shippo-create-metadata-mismatch'
	| 'shippo-create-address-mismatch'
	| 'shippo-create-parcel-mismatch'
	| 'shippo-create-reordered-rates'
	| 'shippo-create-rate-currency-mismatch'
	| 'shippo-create-rate-amount-mismatch'
	| 'shippo-create-rate-shipment-mismatch'
	| 'shippo-create-status-error'
	| 'transaction-client-error'
	| 'transaction-conflict'
	| 'transaction-error'
	| 'transaction-commit-error'
	| 'transaction-commit-timeout'
	| 'transaction-rate-limit'
	| 'transaction-cancel-error'
	| 'transaction-cancel-delay'
	| 'transaction-invalid-json'
	| 'transaction-invalid-body'
	| 'transaction-buyer-missing'
	| 'transaction-seller-missing'
	| 'response-extra-field'
	| 'transaction-fetch-disconnect'
	| 'transaction-fetch-invalid-body'
	| 'transaction-fetch-malformed-json'
	| 'transaction-recovery-reference-mismatch'
	| 'transaction-delay'
	| 'transaction-disconnect';
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

export const PROVIDER_TEST_CREDENTIALS = {
	trustapApiKey: 'trustap-test-key',
	shippoApiKey: 'shippo_test_key',
} as const;

type TrustapChargeRequest = {
	price: number;
	currency: 'eur';
	postageFee: number;
	useHrPost: boolean;
};

type TrustapGuestRequest = {
	id: number;
	email: string;
};

type TrustapGuestResource = { created_at: string; email: string; id: string };

type TrustapTransactionRequest = {
	buyer_id: string;
	seller_id: string;
	creator_role: 'buyer' | 'seller';
	currency: 'eur';
	description: string;
	price: number;
	postage_fee: number;
	charge: number;
	charge_calculator_version: number;
	features?: TrustapTransactionFeature[];
};

type TrustapTransactionFeature = 'require_seller_acceptance' | 'use_hr_post' | 'use_shippo';

type TrustapTransactionResource = Omit<
	typeof trustapTransactionFixture,
	'buyer_id' | 'charge' | 'description' | 'id' | 'price' | 'seller_id' | 'status'
> & {
	buyer_id: string;
	charge: number;
	description: string;
	id: number;
	price: number;
	seller_id: string;
	status: string;
};

type ProviderRoute =
	| { name: 'trustap-guest-user' }
	| { name: 'trustap-charge' }
	| { name: 'trustap-create-transaction' }
	| { name: 'trustap-get-transaction'; transactionId: number }
	| { name: 'trustap-cancel-transaction'; transactionId: number }
	| { name: 'shippo-carrier-accounts' }
	| { name: 'shippo-create-shipment' }
	| { name: 'shippo-get-shipment'; shipmentId: string }
	| { name: 'shippo-get-rate'; rateId: string }
	| { name: 'shippo-create-transaction' };

const JSON_BODY_LIMIT_BYTES = 64 * 1024;
const scenarios: ReadonlySet<StubScenario> = new Set([
	'success',
	'unauthorized',
	'invalid-payload',
	'unprocessable',
	'provider-error',
	'charge-error',
	'charge-delay',
	'charge-disconnect',
	'charge-malformed-json',
	'charge-price-mismatch',
	'charge-currency-mismatch',
	'charge-negative',
	'charge-overflow',
	'charge-version-invalid',
	'charge-seller-invalid',
	'guest-delay',
	'guest-timeout',
	'guest-disconnect-after-create',
	'guest-invalid-body',
	'guest-malformed-json',
	'shippo-delay',
	'shippo-disconnect',
	'shippo-carriers-invalid-body',
	'shippo-carriers-malformed-json',
	'shippo-carriers-delay',
	'shippo-carriers-disconnect',
	'shippo-carriers-empty',
	'shippo-shipment-invalid-body',
	'shippo-shipment-malformed-json',
	'shippo-shipment-disconnect',
	'shippo-rate-invalid-body',
	'shippo-rate-malformed-json',
	'shippo-rate-delay',
	'shippo-rate-disconnect',
	'shippo-rate-shipment-mismatch',
	'shippo-rate-id-mismatch',
	'shippo-rate-amount-mismatch',
	'shippo-rate-currency-mismatch',
	'shippo-label-invalid-body',
	'shippo-label-malformed-json',
	'shippo-label-delay',
	'shippo-label-disconnect',
	'shippo-label-status-error',
	'shippo-label-rate-mismatch',
	'shippo-label-without-tracking',
	'shippo-label-disconnect-after-create',
	'shippo-label-barrier',
	'shippo-reordered-rates',
	'shippo-address-mismatch',
	'shippo-create-metadata-mismatch',
	'shippo-create-address-mismatch',
	'shippo-create-parcel-mismatch',
	'shippo-create-reordered-rates',
	'shippo-create-rate-currency-mismatch',
	'shippo-create-rate-amount-mismatch',
	'shippo-create-rate-shipment-mismatch',
	'shippo-create-status-error',
	'transaction-error',
	'transaction-client-error',
	'transaction-conflict',
	'transaction-commit-error',
	'transaction-commit-timeout',
	'transaction-rate-limit',
	'transaction-cancel-error',
	'transaction-cancel-delay',
	'transaction-invalid-json',
	'transaction-invalid-body',
	'transaction-buyer-missing',
	'transaction-seller-missing',
	'response-extra-field',
	'transaction-fetch-disconnect',
	'transaction-fetch-invalid-body',
	'transaction-fetch-malformed-json',
	'transaction-recovery-reference-mismatch',
	'transaction-delay',
	'transaction-disconnect',
]);
const shippoDistanceUnits: ReadonlySet<string> = new Set(Object.values(DistanceUnitEnum));
const shippoMassUnits: ReadonlySet<string> = new Set(Object.values(WeightUnitEnum));

class RequestBodyTooLargeError extends Error {}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

function sendNotFound(kind: ProviderStubKind, response: ServerResponse): void {
	if (kind === 'trustap') {
		sendJson(response, 404, { error: 'not_found', message: 'Trustap route or resource not found' });
		return;
	}
	sendJson(response, 404, { detail: 'Shippo route or resource not found' });
}

function sendUnauthorized(kind: ProviderStubKind, response: ServerResponse): void {
	if (kind === 'trustap') {
		sendJson(response, 401, {
			error: 'unauthorized',
			message: 'Trustap API credentials are invalid',
		});
		return;
	}
	sendJson(response, 401, { detail: 'Invalid Shippo API token' });
}

function sendValidationError(kind: ProviderStubKind, response: ServerResponse, message?: string): void {
	if (kind === 'trustap') {
		sendJson(response, 400, {
			error: 'invalid_request',
			message: message ?? 'Trustap rejected the request',
		});
		return;
	}
	sendJson(response, 400, { detail: message ?? 'Invalid Shippo request' });
}

function sendProviderError(kind: ProviderStubKind, response: ServerResponse): void {
	if (kind === 'trustap') {
		sendJson(response, 500, { error: 'provider_error', message: 'Trustap provider error' });
		return;
	}
	sendJson(response, 500, { detail: 'Shippo provider error' });
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isSafeInteger(value: unknown, minimum: number): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function parseIntegerParameter(value: string | null, minimum: number): number | undefined {
	if (value === null || !/^(0|[1-9][0-9]*)$/.test(value)) return undefined;
	const integer = Number(value);
	return Number.isSafeInteger(integer) && integer >= minimum ? integer : undefined;
}

function resolveProviderRoute(kind: ProviderStubKind, method: string, pathname: string): ProviderRoute | undefined {
	if (kind === 'trustap') {
		if (method === 'POST' && pathname === '/api/v1/guest_users') return { name: 'trustap-guest-user' };
		if (method === 'GET' && pathname === '/api/v1/charge') return { name: 'trustap-charge' };
		if (method === 'POST' && pathname === '/api/v1/me/transactions/create_with_guest_user') {
			return { name: 'trustap-create-transaction' };
		}
		if (method === 'POST') {
			const cancelMatch = /^\/api\/v1\/transactions\/([0-9]+)\/cancel_with_guest_user$/.exec(pathname);
			const transactionId = cancelMatch ? Number(cancelMatch[1]) : Number.NaN;
			if (Number.isSafeInteger(transactionId) && transactionId > 0) {
				return { name: 'trustap-cancel-transaction', transactionId };
			}
		}
		if (method === 'GET') {
			const transactionMatch = /^\/api\/v1\/transactions\/([0-9]+)$/.exec(pathname);
			const transactionId = transactionMatch ? Number(transactionMatch[1]) : Number.NaN;
			if (Number.isSafeInteger(transactionId) && transactionId > 0) {
				return { name: 'trustap-get-transaction', transactionId };
			}
		}
		return undefined;
	}

	if (method === 'GET' && pathname === '/carrier_accounts') return { name: 'shippo-carrier-accounts' };
	if (method === 'POST' && pathname === '/shipments') return { name: 'shippo-create-shipment' };
	if (method === 'GET') {
		const shipmentMatch = /^\/shipments\/([^/]+)$/.exec(pathname);
		if (shipmentMatch?.[1]) return { name: 'shippo-get-shipment', shipmentId: shipmentMatch[1] };
		const rateMatch = /^\/rates\/([^/]+)$/.exec(pathname);
		if (rateMatch?.[1]) return { name: 'shippo-get-rate', rateId: rateMatch[1] };
	}
	if (method === 'POST' && pathname === '/transactions') return { name: 'shippo-create-transaction' };
	return undefined;
}

function hasExpectedAuthorization(kind: ProviderStubKind, headers: Record<string, string>): boolean {
	const expected =
		kind === 'trustap'
			? `Basic ${Buffer.from(`${PROVIDER_TEST_CREDENTIALS.trustapApiKey}:`).toString('base64')}`
			: `ShippoToken ${PROVIDER_TEST_CREDENTIALS.shippoApiKey}`;
	return headers.authorization === expected;
}

function hasExpectedShippoVersion(headers: Record<string, string>): boolean {
	return headers['shippo-api-version'] === '2018-02-08';
}

function hasJsonContentType(headers: Record<string, string>): boolean {
	return headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function parseTrustapGuest(body: unknown): TrustapGuestRequest | undefined {
	if (!isRecord(body) || !isRecord(body.tos_acceptance)) return undefined;
	if (
		!isSafeInteger(body.id, 1) ||
		!isNonemptyString(body.email) ||
		!body.email.includes('@') ||
		!isNonemptyString(body.first_name) ||
		!isNonemptyString(body.last_name) ||
		typeof body.country_code !== 'string' ||
		body.country_code.length !== 2 ||
		!isSafeInteger(body.tos_acceptance.unix_timestamp, 0) ||
		!isNonemptyString(body.tos_acceptance.ip)
	) {
		return undefined;
	}

	return { id: body.id, email: body.email };
}

function parseTrustapCharge(url: URL): TrustapChargeRequest | undefined {
	const price = parseIntegerParameter(url.searchParams.get('price'), 1);
	const postageFee = parseIntegerParameter(url.searchParams.get('postage_fee'), 0);
	const currency = url.searchParams.get('currency');
	const useHrPost = url.searchParams.get('use_hr_post');
	const requiredNames = ['price', 'currency', 'postage_fee', 'use_hr_post'];

	if (
		url.searchParams.size !== requiredNames.length ||
		requiredNames.some((name) => url.searchParams.getAll(name).length !== 1) ||
		price === undefined ||
		postageFee === undefined ||
		currency !== 'eur' ||
		(useHrPost !== 'true' && useHrPost !== 'false')
	) {
		return undefined;
	}

	return { price, currency, postageFee, useHrPost: useHrPost === 'true' };
}

function parseTrustapTransaction(body: unknown): TrustapTransactionRequest | undefined {
	if (!isRecord(body)) return undefined;
	if (
		!isNonemptyString(body.buyer_id) ||
		!isNonemptyString(body.seller_id) ||
		(body.creator_role !== 'buyer' && body.creator_role !== 'seller') ||
		body.currency !== 'eur' ||
		!isNonemptyString(body.description) ||
		!isSafeInteger(body.price, 1) ||
		!isSafeInteger(body.postage_fee, 0) ||
		!isSafeInteger(body.charge, 0) ||
		!isSafeInteger(body.charge_calculator_version, 1) ||
		!hasSupportedTrustapFeatures(body.features)
	) {
		return undefined;
	}

	return {
		buyer_id: body.buyer_id,
		seller_id: body.seller_id,
		creator_role: body.creator_role,
		currency: body.currency,
		description: body.description,
		price: body.price,
		postage_fee: body.postage_fee,
		charge: body.charge,
		charge_calculator_version: body.charge_calculator_version,
		...(body.features === undefined ? {} : { features: body.features }),
	};
}

const trustapTransactionFeatures: ReadonlySet<string> = new Set([
	'require_seller_acceptance',
	'use_hr_post',
	'use_shippo',
]);

function hasSupportedTrustapFeatures(value: unknown): value is TrustapTransactionFeature[] | undefined {
	return (
		value === undefined ||
		(Array.isArray(value) &&
			value.every(
				(feature): feature is TrustapTransactionFeature =>
					typeof feature === 'string' && trustapTransactionFeatures.has(feature),
			))
	);
}

function isValidShippoShipment(body: unknown): boolean {
	if (!isRecord(body) || !isRecord(body.address_from) || !isRecord(body.address_to)) return false;
	return (
		body.async === false &&
		isNonemptyString(body.metadata) &&
		isNonemptyString(body.address_from.country) &&
		isNonemptyString(body.address_to.country) &&
		Array.isArray(body.parcels) &&
		body.parcels.length > 0 &&
		body.parcels.every(
			(parcel) =>
				isRecord(parcel) &&
				isNonemptyString(parcel.distance_unit) &&
				shippoDistanceUnits.has(parcel.distance_unit) &&
				isNonemptyString(parcel.mass_unit) &&
				shippoMassUnits.has(parcel.mass_unit) &&
				isPositiveFiniteNumericString(parcel.height) &&
				isPositiveFiniteNumericString(parcel.length) &&
				isPositiveFiniteNumericString(parcel.weight) &&
				isPositiveFiniteNumericString(parcel.width),
		)
	);
}

function isPositiveFiniteNumericString(value: unknown): value is string {
	if (typeof value !== 'string' || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return false;
	const numericValue = Number(value);
	return Number.isFinite(numericValue) && numericValue > 0;
}

function parseShippoTransaction(body: unknown): { rate: string } | undefined {
	if (!isRecord(body) || !isNonemptyString(body.rate) || body.async !== false || body.label_file_type !== 'PDF') {
		return undefined;
	}
	return { rate: body.rate };
}

function trustapHandshakeKey(input: Pick<TrustapTransactionRequest, 'price' | 'currency' | 'postage_fee'>): string {
	return `${input.price}:${input.currency}:${input.postage_fee}`;
}

function trustapTransactionResponse(
	transaction: TrustapTransactionResource,
	scenario: StubScenario,
): Record<string, unknown> {
	if (scenario === 'transaction-buyer-missing') {
		const response: Partial<TrustapTransactionResource> = { ...transaction };
		delete response.buyer_id;
		return response;
	}
	if (scenario === 'transaction-seller-missing') {
		const response: Partial<TrustapTransactionResource> = { ...transaction };
		delete response.seller_id;
		return response;
	}
	if (scenario === 'response-extra-field') {
		return { ...transaction, provider_future_optional: 'safe-future-value' };
	}
	return transaction;
}

function injectedScenarioResponse(kind: ProviderStubKind, scenario: StubScenario, response: ServerResponse): boolean {
	switch (scenario) {
		case 'success':
			return false;
		case 'unauthorized':
			sendUnauthorized(kind, response);
			return true;
		case 'invalid-payload':
			sendValidationError(kind, response);
			return true;
		case 'unprocessable':
			sendJson(response, 422, { error: 'unprocessable', message: 'Provider could not safely classify outcome' });
			return true;
		case 'provider-error':
			sendProviderError(kind, response);
			return true;
		case 'charge-error':
		case 'charge-delay':
		case 'charge-disconnect':
		case 'charge-malformed-json':
		case 'charge-price-mismatch':
		case 'charge-currency-mismatch':
		case 'charge-negative':
		case 'charge-overflow':
		case 'charge-version-invalid':
		case 'charge-seller-invalid':
		case 'guest-delay':
		case 'guest-timeout':
		case 'guest-disconnect-after-create':
		case 'guest-invalid-body':
		case 'guest-malformed-json':
			return false;
		case 'shippo-delay':
		case 'shippo-disconnect':
		case 'shippo-carriers-invalid-body':
		case 'shippo-carriers-malformed-json':
		case 'shippo-carriers-delay':
		case 'shippo-carriers-disconnect':
		case 'shippo-carriers-empty':
		case 'shippo-shipment-invalid-body':
		case 'shippo-shipment-malformed-json':
		case 'shippo-shipment-disconnect':
		case 'shippo-rate-invalid-body':
		case 'shippo-rate-malformed-json':
		case 'shippo-rate-delay':
		case 'shippo-rate-disconnect':
		case 'shippo-rate-shipment-mismatch':
		case 'shippo-rate-id-mismatch':
		case 'shippo-rate-amount-mismatch':
		case 'shippo-rate-currency-mismatch':
		case 'shippo-label-invalid-body':
		case 'shippo-label-malformed-json':
		case 'shippo-label-delay':
		case 'shippo-label-disconnect':
		case 'shippo-label-status-error':
		case 'shippo-label-rate-mismatch':
		case 'shippo-label-without-tracking':
		case 'shippo-label-disconnect-after-create':
		case 'shippo-label-barrier':
		case 'shippo-reordered-rates':
		case 'shippo-address-mismatch':
		case 'shippo-create-metadata-mismatch':
		case 'shippo-create-address-mismatch':
		case 'shippo-create-parcel-mismatch':
		case 'shippo-create-reordered-rates':
		case 'shippo-create-rate-currency-mismatch':
		case 'shippo-create-rate-amount-mismatch':
		case 'shippo-create-rate-shipment-mismatch':
		case 'shippo-create-status-error':
			return false;
		case 'transaction-error':
		case 'transaction-client-error':
		case 'transaction-conflict':
		case 'transaction-commit-error':
		case 'transaction-commit-timeout':
		case 'transaction-rate-limit':
		case 'transaction-cancel-error':
		case 'transaction-cancel-delay':
		case 'transaction-invalid-json':
		case 'transaction-invalid-body':
		case 'transaction-buyer-missing':
		case 'transaction-seller-missing':
		case 'response-extra-field':
		case 'transaction-fetch-disconnect':
		case 'transaction-fetch-invalid-body':
		case 'transaction-fetch-malformed-json':
		case 'transaction-recovery-reference-mismatch':
		case 'transaction-delay':
		case 'transaction-disconnect':
			return false;
	}
}

export async function startProviderStub(kind: ProviderStubKind): Promise<StartedProviderStub> {
	let scenario: StubScenario = 'success';
	let requests: CapturedRequest[] = [];
	const trustapHandshakes = new Map<string, { charge: number; version: number }>();
	const trustapGuests = new Map<number, TrustapGuestResource>();
	const trustapTransactions = new Map<number, TrustapTransactionResource>([
		[trustapTransactionFixture.id, trustapTransactionFixture],
	]);
	let nextTrustapTransactionId = trustapTransactionFixture.id + 1;
	const shippoShipments = new Map<string, typeof shippoShipmentFixture>();
	const shippoRateIds = new Set<string>();
	const shippoRates = new Map<string, typeof shippoRateFixture>();
	let nextShippoShipmentOrdinal = 1;
	let nextShippoTransactionOrdinal = 1;
	let shippoLabelBarrierReached = 0;
	let releaseShippoLabelBarrier: (() => void) | undefined;
	let shippoLabelBarrier = new Promise<void>((resolve) => {
		releaseShippoLabelBarrier = resolve;
	});

	const resetShippoLabelBarrier = () => {
		shippoLabelBarrierReached = 0;
		shippoLabelBarrier = new Promise<void>((resolve) => {
			releaseShippoLabelBarrier = resolve;
		});
	};

	const resetState = () => {
		requests = [];
		scenario = 'success';
		trustapHandshakes.clear();
		trustapGuests.clear();
		trustapTransactions.clear();
		trustapTransactions.set(trustapTransactionFixture.id, trustapTransactionFixture);
		nextTrustapTransactionId = trustapTransactionFixture.id + 1;
		shippoShipments.clear();
		shippoRateIds.clear();
		shippoRates.clear();
		nextShippoShipmentOrdinal = 1;
		nextShippoTransactionOrdinal = 1;
		resetShippoLabelBarrier();
	};

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
					resetState();
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
					if (scenario === 'shippo-label-barrier') resetShippoLabelBarrier();
					sendJson(response, 200, { scenario });
					return;
				}

				if (kind === 'shippo' && method === 'GET' && requestUrl.pathname === '/__test/label-barrier') {
					sendJson(response, 200, { reached: shippoLabelBarrierReached });
					return;
				}

				if (kind === 'shippo' && method === 'POST' && requestUrl.pathname === '/__test/label-barrier/release') {
					releaseShippoLabelBarrier?.();
					sendJson(response, 200, { released: true });
					return;
				}

				if (method === 'GET' && requestUrl.pathname === '/__test/requests') {
					sendJson(response, 200, requests);
					return;
				}

				if (kind === 'trustap' && method === 'POST' && requestUrl.pathname === '/__test/transaction-status') {
					const body = await readJsonBody(request);
					const transactionId = isRecord(body) ? body.transaction_id : undefined;
					const status = isRecord(body) ? body.status : undefined;
					const description = isRecord(body) ? body.description : undefined;
					const transaction =
						typeof transactionId === 'number' && Number.isSafeInteger(transactionId)
							? trustapTransactions.get(transactionId)
							: undefined;
					if (!transaction || typeof status !== 'string') {
						sendJson(response, 404, { error: 'Trustap transaction control target not found' });
						return;
					}
					if (description !== undefined && !isNonemptyString(description)) {
						sendJson(response, 400, { error: 'Invalid Trustap transaction description' });
						return;
					}
					trustapTransactions.set(transaction.id, {
						...transaction,
						status,
						...(typeof description === 'string' ? { description } : {}),
					});
					sendJson(response, 200, { transaction_id: transactionId, status });
					return;
				}

				if (kind === 'trustap' && method === 'GET' && requestUrl.pathname === '/__test/guest-identities') {
					sendJson(
						response,
						200,
						[...trustapGuests.entries()].map(([client_id, guest]) => ({ client_id, ...guest })),
					);
					return;
				}

				sendJson(response, 404, { error: 'Provider stub control route not found' });
				return;
			}

			const route = resolveProviderRoute(kind, method, requestUrl.pathname);
			if (!route) {
				sendNotFound(kind, response);
				return;
			}

			const headers = normalizeHeaders(request);
			if (!hasExpectedAuthorization(kind, headers)) {
				sendUnauthorized(kind, response);
				return;
			}
			if (kind === 'shippo' && !hasExpectedShippoVersion(headers)) {
				sendValidationError(kind, response, 'Unsupported Shippo API version');
				return;
			}
			if (
				kind === 'trustap' &&
				(route.name === 'trustap-guest-user' || route.name === 'trustap-create-transaction') &&
				!hasJsonContentType(headers)
			) {
				sendValidationError(kind, response, 'Trustap Content-Type must be application/json');
				return;
			}

			const body = await readJsonBody(request);
			requests.push({
				method,
				path: `${requestUrl.pathname}${requestUrl.search}`,
				headers,
				body,
			});

			let trustapCharge: TrustapChargeRequest | undefined;
			let trustapGuest: TrustapGuestRequest | undefined;
			let trustapTransaction: TrustapTransactionRequest | undefined;
			let shippoTransaction: { rate: string } | undefined;

			switch (route.name) {
				case 'trustap-guest-user':
					trustapGuest = parseTrustapGuest(body);
					if (!trustapGuest) {
						sendValidationError(kind, response);
						return;
					}
					break;
				case 'trustap-charge':
					trustapCharge = parseTrustapCharge(requestUrl);
					if (!trustapCharge) {
						sendValidationError(kind, response);
						return;
					}
					break;
				case 'trustap-create-transaction': {
					if (isRecord(body) && body.features !== undefined && !hasSupportedTrustapFeatures(body.features)) {
						sendValidationError(kind, response, 'Unsupported Trustap transaction feature');
						return;
					}
					trustapTransaction = parseTrustapTransaction(body);
					const actingUser =
						trustapTransaction?.creator_role === 'buyer' ? trustapTransaction.buyer_id : trustapTransaction?.seller_id;
					if (!trustapTransaction || headers['trustap-user'] !== actingUser) {
						sendValidationError(kind, response);
						return;
					}
					const handshake = trustapHandshakes.get(trustapHandshakeKey(trustapTransaction));
					if (
						!handshake ||
						handshake.charge !== trustapTransaction.charge ||
						handshake.version !== trustapTransaction.charge_calculator_version
					) {
						sendValidationError(kind, response, 'Trustap charge handshake does not match');
						return;
					}
					break;
				}
				case 'shippo-create-shipment':
					if (!isValidShippoShipment(body)) {
						sendValidationError(kind, response);
						return;
					}
					break;
				case 'shippo-get-shipment':
					if (!shippoShipments.has(route.shipmentId)) {
						sendNotFound(kind, response);
						return;
					}
					break;
				case 'shippo-get-rate':
					if (!shippoRates.has(route.rateId)) {
						sendNotFound(kind, response);
						return;
					}
					break;
				case 'shippo-create-transaction':
					shippoTransaction = parseShippoTransaction(body);
					if (!shippoTransaction || !shippoRateIds.has(shippoTransaction.rate)) {
						sendValidationError(kind, response);
						return;
					}
					break;
				case 'trustap-get-transaction':
					if (!trustapTransactions.has(route.transactionId)) {
						sendNotFound(kind, response);
						return;
					}
					break;
				case 'trustap-cancel-transaction': {
					const transaction = trustapTransactions.get(route.transactionId);
					if (
						!transaction ||
						(headers['trustap-user'] !== transaction.buyer_id && headers['trustap-user'] !== transaction.seller_id)
					) {
						sendValidationError(kind, response, 'Trustap cancellation actor does not match');
						return;
					}
					break;
				}
			}

			if (scenario === 'transaction-error' && route.name === 'trustap-create-transaction') {
				sendProviderError(kind, response);
				return;
			}
			if (scenario === 'charge-error' && route.name === 'trustap-charge') {
				sendProviderError(kind, response);
				return;
			}
			if (scenario === 'transaction-client-error' && route.name === 'trustap-create-transaction') {
				sendValidationError(kind, response, 'Trustap deterministically rejected the transaction');
				return;
			}
			if (scenario === 'transaction-conflict' && route.name === 'trustap-create-transaction') {
				sendJson(response, 409, { error: 'conflict', message: 'Trustap transaction outcome is unknown' });
				return;
			}
			if (injectedScenarioResponse(kind, scenario, response)) return;

			switch (route.name) {
				case 'trustap-guest-user':
					if (!trustapGuest) throw new Error('Validated Trustap guest input is missing');
					{
						const guest = trustapGuests.get(trustapGuest.id) ?? {
							...trustapGuestUserFixture,
							email: trustapGuest.email,
							id: `guest-${trustapGuest.id}`,
						};
						trustapGuests.set(trustapGuest.id, guest);
						if (scenario === 'guest-disconnect-after-create') {
							response.destroy();
							return;
						}
						if (scenario === 'guest-invalid-body') {
							sendJson(response, 201, { ...guest, id: '', email: 'different@example.test' });
							return;
						}
						if (scenario === 'guest-malformed-json') {
							response.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
							response.end('{"id":');
							return;
						}
						if (scenario === 'guest-timeout') {
							setTimeout(() => sendJson(response, 201, guest), 500);
							return;
						}
						if (scenario === 'guest-delay') {
							setTimeout(() => sendJson(response, 201, guest), 75);
							return;
						}
						sendJson(response, 201, guest);
					}
					return;
				case 'trustap-charge': {
					if (!trustapCharge) throw new Error('Validated Trustap charge input is missing');
					const charge = Math.round(trustapCharge.price * 0.05);
					const chargeResponse = {
						...trustapChargeFixture,
						price: trustapCharge.price,
						charge,
					};
					if (scenario === 'charge-price-mismatch') {
						sendJson(response, 200, { ...chargeResponse, price: trustapCharge.price + 1 });
						return;
					}
					if (scenario === 'charge-currency-mismatch') {
						sendJson(response, 200, { ...chargeResponse, currency: 'usd' });
						return;
					}
					if (scenario === 'charge-negative') {
						sendJson(response, 200, { ...chargeResponse, charge: -1 });
						return;
					}
					if (scenario === 'charge-overflow') {
						sendJson(response, 200, { ...chargeResponse, charge: 2_147_483_648 });
						return;
					}
					if (scenario === 'charge-version-invalid') {
						sendJson(response, 200, { ...chargeResponse, charge_calculator_version: 0 });
						return;
					}
					if (scenario === 'charge-seller-invalid') {
						sendJson(response, 200, { ...chargeResponse, charge_seller: 1 });
						return;
					}
					if (scenario === 'charge-malformed-json') {
						response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
						response.end('{"charge":');
						return;
					}
					if (scenario === 'charge-disconnect') {
						response.destroy();
						return;
					}
					trustapHandshakes.set(
						trustapHandshakeKey({
							price: trustapCharge.price,
							currency: trustapCharge.currency,
							postage_fee: trustapCharge.postageFee,
						}),
						{ charge, version: chargeResponse.charge_calculator_version },
					);
					const responseBody =
						scenario === 'response-extra-field'
							? { ...chargeResponse, provider_future_optional: 'safe-future-value' }
							: chargeResponse;
					if (scenario === 'charge-delay') {
						setTimeout(() => sendJson(response, 200, responseBody), 500);
						return;
					}
					sendJson(response, 200, responseBody);
					return;
				}
				case 'trustap-create-transaction': {
					if (!trustapTransaction) throw new Error('Validated Trustap transaction input is missing');
					const transaction: TrustapTransactionResource = {
						...trustapTransactionFixture,
						id: nextTrustapTransactionId,
						buyer_id: trustapTransaction.buyer_id,
						seller_id: trustapTransaction.seller_id,
						currency: trustapTransaction.currency,
						description: trustapTransaction.description,
						price: trustapTransaction.price,
						charge: trustapTransaction.charge,
					};
					nextTrustapTransactionId += 1;
					trustapTransactions.set(transaction.id, transaction);
					if (scenario === 'transaction-commit-error') {
						sendProviderError(kind, response);
						return;
					}
					if (scenario === 'transaction-commit-timeout') {
						sendJson(response, 408, { error: 'request_timeout', message: 'Transaction outcome is unknown' });
						return;
					}
					if (scenario === 'transaction-rate-limit') {
						sendJson(response, 429, { error: 'rate_limited', message: 'Transaction outcome is unknown' });
						return;
					}
					if (scenario === 'transaction-invalid-json') {
						response.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
						response.end('{"id":');
						return;
					}
					if (scenario === 'transaction-invalid-body') {
						sendJson(response, 201, {
							id: transaction.id,
							buyer_id: transaction.buyer_id,
							seller_id: transaction.seller_id,
							status: transaction.status,
						});
						return;
					}
					if (scenario === 'transaction-delay') {
						setTimeout(() => sendJson(response, 201, transaction), 500);
						return;
					}
					if (scenario === 'transaction-disconnect') {
						response.destroy();
						return;
					}
					sendJson(response, 201, trustapTransactionResponse(transaction, scenario));
					return;
				}
				case 'trustap-get-transaction': {
					const transaction = trustapTransactions.get(route.transactionId);
					if (!transaction) throw new Error('Known Trustap transaction is missing');
					if (scenario === 'transaction-fetch-malformed-json') {
						response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
						response.end('{"id":');
						return;
					}
					if (scenario === 'transaction-fetch-invalid-body') {
						sendJson(response, 200, { id: transaction.id, status: transaction.status });
						return;
					}
					if (scenario === 'transaction-fetch-disconnect') {
						response.destroy();
						return;
					}
					if (scenario === 'transaction-recovery-reference-mismatch') {
						sendJson(response, 200, { ...transaction, description: 'unrelated support reference' });
						return;
					}
					if (scenario === 'transaction-delay') {
						setTimeout(() => sendJson(response, 200, transaction), 500);
						return;
					}
					sendJson(response, 200, trustapTransactionResponse(transaction, scenario));
					return;
				}
				case 'trustap-cancel-transaction': {
					const transaction = trustapTransactions.get(route.transactionId);
					if (!transaction) throw new Error('Known Trustap transaction is missing');
					if (scenario === 'transaction-cancel-error') {
						sendProviderError(kind, response);
						return;
					}
					const cancelled: TrustapTransactionResource = { ...transaction, status: 'cancelled' };
					trustapTransactions.set(route.transactionId, cancelled);
					const responseBody = trustapTransactionResponse(cancelled, scenario);
					if (scenario === 'transaction-cancel-delay') {
						setTimeout(() => sendJson(response, 200, responseBody), 500);
						return;
					}
					sendJson(response, 200, responseBody);
					return;
				}
				case 'shippo-carrier-accounts':
					if (scenario === 'shippo-carriers-empty') {
						sendJson(response, 200, { ...shippoCarrierAccountsFixture, results: [] });
						return;
					}
					if (scenario === 'shippo-carriers-invalid-body') {
						sendJson(response, 200, { next: '', previous: '' });
						return;
					}
					if (scenario === 'shippo-carriers-malformed-json') {
						response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
						response.end('{"results":');
						return;
					}
					if (scenario === 'shippo-carriers-disconnect' || scenario === 'shippo-disconnect') {
						response.destroy();
						return;
					}
					if (scenario === 'shippo-carriers-delay') {
						setTimeout(() => sendJson(response, 200, shippoCarrierAccountsFixture), 500);
						return;
					}
					sendJson(response, 200, shippoCarrierAccountsFixture);
					return;
				case 'shippo-create-shipment':
					if (!isRecord(body) || !isRecord(body.address_from) || !isRecord(body.address_to)) {
						throw new Error('Validated Shippo shipment input is missing');
					}
					{
						const suffix = nextShippoShipmentOrdinal === 1 ? '' : `-${nextShippoShipmentOrdinal}`;
						const shipmentId = `${shippoShipmentFixture.object_id}${suffix}`;
						const rateId = `${shippoRateFixture.object_id}${suffix}`;
						nextShippoShipmentOrdinal += 1;
						const shipment = {
							...shippoShipmentFixture,
							object_id: shipmentId,
							metadata: String(body.metadata),
							address_from: body.address_from as typeof shippoShipmentFixture.address_from,
							address_to: body.address_to as typeof shippoShipmentFixture.address_to,
							parcels: body.parcels as unknown as typeof shippoShipmentFixture.parcels,
							rates: [{ ...shippoRateFixture, object_id: rateId, shipment: shipmentId }],
						} as typeof shippoShipmentFixture;
						shippoShipments.set(shipmentId, shipment);
						shippoRateIds.add(rateId);
						shippoRates.set(rateId, shipment.rates[0]);
						if (scenario === 'shippo-shipment-invalid-body') {
							sendJson(response, 201, { object_id: shipmentId, rates: [] });
							return;
						}
						if (scenario === 'shippo-shipment-malformed-json') {
							response.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
							response.end('{"object_id":');
							return;
						}
						if (scenario === 'shippo-shipment-disconnect' || scenario === 'shippo-disconnect') {
							response.destroy();
							return;
						}
						if (scenario === 'shippo-create-metadata-mismatch') {
							sendJson(response, 201, { ...shipment, metadata: 'tampered-metadata' });
							return;
						}
						if (scenario === 'shippo-create-address-mismatch') {
							sendJson(response, 201, {
								...shipment,
								address_to: { ...shipment.address_to, street1: 'Tampered provider address' },
							});
							return;
						}
						if (scenario === 'shippo-create-parcel-mismatch') {
							sendJson(response, 201, {
								...shipment,
								parcels: [{ ...shipment.parcels[0], width: '999' }],
							});
							return;
						}
						if (scenario === 'shippo-create-reordered-rates') {
							sendJson(response, 201, {
								...shipment,
								rates: [
									{
										...shippoRateFixture,
										amount: '0.01',
										attributes: [],
										object_id: `${rateId}-cheap-decoy`,
										shipment: shipmentId,
									},
									...shipment.rates,
								],
							});
							return;
						}
						if (scenario === 'shippo-create-rate-currency-mismatch') {
							sendJson(response, 201, {
								...shipment,
								rates: [{ ...shipment.rates[0], currency: 'USD' }],
							});
							return;
						}
						if (scenario === 'shippo-create-rate-amount-mismatch') {
							sendJson(response, 201, {
								...shipment,
								rates: [{ ...shipment.rates[0], amount: '0.00' }],
							});
							return;
						}
						if (scenario === 'shippo-create-rate-shipment-mismatch') {
							sendJson(response, 201, {
								...shipment,
								rates: [{ ...shipment.rates[0], shipment: 'shipment-other' }],
							});
							return;
						}
						if (scenario === 'shippo-create-status-error') {
							sendJson(response, 201, { ...shipment, status: 'ERROR' });
							return;
						}
						if (scenario === 'shippo-delay') {
							setTimeout(() => sendJson(response, 201, shipment), 500);
							return;
						}
						sendJson(response, 201, shipment);
					}
					return;
				case 'shippo-get-shipment':
					{
						const shipment = shippoShipments.get(route.shipmentId);
						if (!shipment) throw new Error('Known Shippo shipment is missing');
						if (scenario === 'shippo-delay') {
							setTimeout(() => sendJson(response, 200, shipment), 500);
							return;
						}
						if (scenario === 'shippo-reordered-rates') {
							sendJson(response, 200, {
								...shipment,
								rates: [
									{ ...shippoRateFixture, object_id: 'rate-cheap-decoy', amount: '0.01', shipment: route.shipmentId },
									...shipment.rates,
								],
							});
							return;
						}
						if (scenario === 'shippo-address-mismatch') {
							sendJson(response, 200, {
								...shipment,
								address_to: { ...shipment.address_to, street1: 'Tampered provider address' },
							});
							return;
						}
						sendJson(response, 200, shipment);
					}
					return;
				case 'shippo-get-rate': {
					const rate = shippoRates.get(route.rateId);
					if (!rate) throw new Error('Known Shippo rate is missing');
					if (scenario === 'shippo-rate-invalid-body') {
						sendJson(response, 200, { ...rate, shipment: '' });
						return;
					}
					if (scenario === 'shippo-rate-malformed-json') {
						response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
						response.end('{"object_id":');
						return;
					}
					if (scenario === 'shippo-rate-disconnect' || scenario === 'shippo-disconnect') {
						response.destroy();
						return;
					}
					if (scenario === 'shippo-rate-delay') {
						setTimeout(() => sendJson(response, 200, rate), 500);
						return;
					}
					if (scenario === 'shippo-rate-shipment-mismatch') {
						sendJson(response, 200, { ...rate, shipment: 'shipment-other' });
						return;
					}
					if (scenario === 'shippo-rate-id-mismatch') {
						sendJson(response, 200, { ...rate, object_id: 'rate-other' });
						return;
					}
					if (scenario === 'shippo-rate-amount-mismatch') {
						sendJson(response, 200, { ...rate, amount: '99.99' });
						return;
					}
					if (scenario === 'shippo-rate-currency-mismatch') {
						sendJson(response, 200, { ...rate, currency: 'USD' });
						return;
					}
					sendJson(response, 200, rate);
					return;
				}
				case 'shippo-create-transaction': {
					if (!shippoTransaction) throw new Error('Validated Shippo transaction input is missing');
					const suffix = nextShippoTransactionOrdinal === 1 ? '' : `-${nextShippoTransactionOrdinal}`;
					nextShippoTransactionOrdinal += 1;
					const transaction = {
						...shippoTransactionFixture,
						object_id: `${shippoTransactionFixture.object_id}${suffix}`,
						rate: shippoTransaction.rate,
					};
					if (scenario === 'shippo-label-barrier') {
						shippoLabelBarrierReached += 1;
						await shippoLabelBarrier;
					}
					if (scenario === 'shippo-label-disconnect-after-create') {
						response.destroy();
						return;
					}
					if (scenario === 'shippo-label-invalid-body') {
						sendJson(response, 201, { ...transaction, tracking_url_provider: '' });
						return;
					}
					if (scenario === 'shippo-label-malformed-json') {
						response.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
						response.end('{"object_id":');
						return;
					}
					if (scenario === 'shippo-label-disconnect' || scenario === 'shippo-disconnect') {
						response.destroy();
						return;
					}
					if (scenario === 'shippo-label-delay') {
						setTimeout(() => sendJson(response, 201, transaction), 500);
						return;
					}
					if (scenario === 'shippo-label-status-error') {
						sendJson(response, 201, { ...transaction, status: 'ERROR' });
						return;
					}
					if (scenario === 'shippo-label-rate-mismatch') {
						sendJson(response, 201, { ...transaction, rate: 'rate-other' });
						return;
					}
					if (scenario === 'shippo-label-without-tracking') {
						const withoutTracking: Record<string, unknown> = { ...transaction };
						delete withoutTracking.tracking_number;
						delete withoutTracking.tracking_url_provider;
						sendJson(response, 201, withoutTracking);
						return;
					}
					sendJson(response, 201, transaction);
					return;
				}
			}
		} catch (error) {
			if (error instanceof RequestBodyTooLargeError) {
				if (kind === 'trustap') {
					sendJson(response, 413, {
						error: 'payload_too_large',
						message: 'Trustap request body is too large',
					});
				} else {
					sendJson(response, 413, { detail: 'Shippo request body is too large' });
				}
				return;
			}
			if (error instanceof SyntaxError) {
				sendValidationError(kind, response, `${kind === 'trustap' ? 'Trustap' : 'Shippo'} received malformed JSON`);
				return;
			}
			sendProviderError(kind, response);
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
