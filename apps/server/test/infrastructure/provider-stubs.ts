import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DistanceUnitEnum, WeightUnitEnum } from 'shippo/models/components/index.js';

import {
	shippoCarrierAccountsFixture,
	shippoRateFixture,
	shippoRefundFixture,
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
	| 'trustap-carriers-unsupported'
	| 'trustap-carriers-invalid-body'
	| 'trustap-carriers-malformed-json'
	| 'trustap-track-provider-error'
	| 'trustap-track-malformed-json'
	| 'trustap-track-id-mismatch'
	| 'trustap-track-disconnect'
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
	| 'shippo-rate-barrier'
	| 'shippo-label-invalid-body'
	| 'shippo-label-malformed-json'
	| 'shippo-label-delay'
	| 'shippo-label-disconnect'
	| 'shippo-label-client-error'
	| 'shippo-label-unauthorized'
	| 'shippo-label-forbidden'
	| 'shippo-label-not-found'
	| 'shippo-label-unprocessable'
	| 'shippo-label-request-timeout'
	| 'shippo-label-conflict'
	| 'shippo-label-too-early'
	| 'shippo-label-rate-limited'
	| 'shippo-label-provider-error'
	| 'shippo-label-status-error'
	| 'shippo-label-status-error-malformed'
	| 'shippo-label-status-error-rate-mismatch'
	| 'shippo-label-error-label-url'
	| 'shippo-label-error-commercial-invoice-url'
	| 'shippo-label-error-qr-code-url'
	| 'shippo-label-error-tracking-number'
	| 'shippo-label-error-tracking-url'
	| 'shippo-label-error-tracking-status'
	| 'shippo-label-rate-mismatch'
	| 'shippo-label-without-tracking'
	| 'shippo-label-disconnect-after-create'
	| 'shippo-label-barrier'
	| 'shippo-label-metadata-mismatch'
	| 'shippo-refund-pending'
	| 'shippo-refund-status-error'
	| 'shippo-refund-invalid-body'
	| 'shippo-refund-transaction-mismatch'
	| 'shippo-refund-disconnect-after-create'
	| 'shippo-refund-client-error'
	| 'shippo-refund-provider-error'
	| 'shippo-refund-get-provider-error'
	| 'shippo-reordered-rates'
	| 'shippo-address-mismatch'
	| 'shippo-create-metadata-mismatch'
	| 'shippo-create-address-mismatch'
	| 'shippo-create-parcel-mismatch'
	| 'shippo-create-reordered-rates'
	| 'shippo-create-rate-convertible-usd'
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
	| 'transaction-cancel-id-mismatch'
	| 'transaction-cancel-buyer-mismatch'
	| 'transaction-cancel-seller-mismatch'
	| 'transaction-cancel-price-mismatch'
	| 'transaction-cancel-charge-mismatch'
	| 'transaction-cancel-charge-seller-mismatch'
	| 'transaction-cancel-currency-mismatch'
	| 'transaction-cancel-description-mismatch'
	| 'transaction-cancel-status-mismatch'
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

type TrustapTrackingRequest = {
	carrier: string;
	tracking_code: string;
};

type TrustapTransactionFeature = 'require_seller_acceptance' | 'use_custom_postage_fee' | 'use_hr_post';

type TrustapTransactionResource = Omit<
	typeof trustapTransactionFixture,
	'buyer_id' | 'charge' | 'description' | 'id' | 'price' | 'seller_id' | 'status'
> & {
	buyer_id: string;
	charge: number;
	description: string;
	id: number | string;
	price: number;
	seller_id: string;
	status: string;
	charge_postage_buyer?: number;
	charge_postage_client?: number;
	tracked?: string;
	tracking?: TrustapTrackingRequest;
};

type ShippoRefundResource = Omit<typeof shippoRefundFixture, 'object_id' | 'status' | 'transaction'> & {
	object_id: string;
	status: 'QUEUED' | 'PENDING' | 'SUCCESS' | 'ERROR';
	transaction: string;
};

type ProviderRoute =
	| { name: 'trustap-guest-user' }
	| { name: 'trustap-charge' }
	| { name: 'trustap-create-transaction' }
	| { name: 'trustap-supported-carriers' }
	| { name: 'trustap-get-transaction'; transactionId: string }
	| { name: 'trustap-cancel-transaction'; transactionId: string }
	| { name: 'trustap-track-transaction'; transactionId: string }
	| { name: 'shippo-carrier-accounts' }
	| { name: 'shippo-create-shipment' }
	| { name: 'shippo-list-rates-in-currency'; shipmentId: string; currencyCode: string }
	| { name: 'shippo-get-shipment'; shipmentId: string }
	| { name: 'shippo-get-rate'; rateId: string }
	| { name: 'shippo-create-transaction' }
	| { name: 'shippo-create-refund' }
	| { name: 'shippo-get-refund'; refundId: string };

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
	'trustap-carriers-unsupported',
	'trustap-carriers-invalid-body',
	'trustap-carriers-malformed-json',
	'trustap-track-provider-error',
	'trustap-track-malformed-json',
	'trustap-track-id-mismatch',
	'trustap-track-disconnect',
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
	'shippo-rate-barrier',
	'shippo-label-invalid-body',
	'shippo-label-malformed-json',
	'shippo-label-delay',
	'shippo-label-disconnect',
	'shippo-label-client-error',
	'shippo-label-unauthorized',
	'shippo-label-forbidden',
	'shippo-label-not-found',
	'shippo-label-unprocessable',
	'shippo-label-request-timeout',
	'shippo-label-conflict',
	'shippo-label-too-early',
	'shippo-label-rate-limited',
	'shippo-label-provider-error',
	'shippo-label-status-error',
	'shippo-label-status-error-malformed',
	'shippo-label-status-error-rate-mismatch',
	'shippo-label-error-label-url',
	'shippo-label-error-commercial-invoice-url',
	'shippo-label-error-qr-code-url',
	'shippo-label-error-tracking-number',
	'shippo-label-error-tracking-url',
	'shippo-label-error-tracking-status',
	'shippo-label-rate-mismatch',
	'shippo-label-without-tracking',
	'shippo-label-disconnect-after-create',
	'shippo-label-barrier',
	'shippo-label-metadata-mismatch',
	'shippo-refund-pending',
	'shippo-refund-status-error',
	'shippo-refund-invalid-body',
	'shippo-refund-transaction-mismatch',
	'shippo-refund-disconnect-after-create',
	'shippo-refund-client-error',
	'shippo-refund-provider-error',
	'shippo-refund-get-provider-error',
	'shippo-reordered-rates',
	'shippo-address-mismatch',
	'shippo-create-metadata-mismatch',
	'shippo-create-address-mismatch',
	'shippo-create-parcel-mismatch',
	'shippo-create-reordered-rates',
	'shippo-create-rate-convertible-usd',
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
	'transaction-cancel-id-mismatch',
	'transaction-cancel-buyer-mismatch',
	'transaction-cancel-seller-mismatch',
	'transaction-cancel-price-mismatch',
	'transaction-cancel-charge-mismatch',
	'transaction-cancel-charge-seller-mismatch',
	'transaction-cancel-currency-mismatch',
	'transaction-cancel-description-mismatch',
	'transaction-cancel-status-mismatch',
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

function canonicalStubTrustapId(value: unknown): string | undefined {
	if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
	if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) return undefined;
	return BigInt(value) <= 9_223_372_036_854_775_807n ? value : undefined;
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
		if (method === 'GET' && pathname === '/api/v1/supported_carriers') return { name: 'trustap-supported-carriers' };
		if (method === 'POST' && pathname === '/api/v1/me/transactions/create_with_guest_user') {
			return { name: 'trustap-create-transaction' };
		}
		if (method === 'POST') {
			const trackMatch = /^\/api\/v1\/transactions\/([0-9]+)\/track_with_guest_seller$/.exec(pathname);
			const trackingTransactionId = canonicalStubTrustapId(trackMatch?.[1]);
			if (trackingTransactionId) {
				return { name: 'trustap-track-transaction', transactionId: trackingTransactionId };
			}
			const cancelMatch = /^\/api\/v1\/transactions\/([0-9]+)\/cancel_with_guest_user$/.exec(pathname);
			const transactionId = canonicalStubTrustapId(cancelMatch?.[1]);
			if (transactionId) {
				return { name: 'trustap-cancel-transaction', transactionId };
			}
		}
		if (method === 'GET') {
			const transactionMatch = /^\/api\/v1\/transactions\/([0-9]+)$/.exec(pathname);
			const transactionId = canonicalStubTrustapId(transactionMatch?.[1]);
			if (transactionId) {
				return { name: 'trustap-get-transaction', transactionId };
			}
		}
		return undefined;
	}

	if (method === 'GET' && pathname === '/carrier_accounts') return { name: 'shippo-carrier-accounts' };
	if (method === 'POST' && pathname === '/shipments') return { name: 'shippo-create-shipment' };
	if (method === 'GET') {
		const ratesInCurrencyMatch = /^\/shipments\/([^/]+)\/rates\/([^/]+)$/.exec(pathname);
		if (ratesInCurrencyMatch?.[1] && ratesInCurrencyMatch[2]) {
			return {
				name: 'shippo-list-rates-in-currency',
				shipmentId: ratesInCurrencyMatch[1],
				currencyCode: ratesInCurrencyMatch[2],
			};
		}
		const shipmentMatch = /^\/shipments\/([^/]+)$/.exec(pathname);
		if (shipmentMatch?.[1]) return { name: 'shippo-get-shipment', shipmentId: shipmentMatch[1] };
		const rateMatch = /^\/rates\/([^/]+)$/.exec(pathname);
		if (rateMatch?.[1]) return { name: 'shippo-get-rate', rateId: rateMatch[1] };
		const refundMatch = /^\/refunds\/([^/]+)$/.exec(pathname);
		if (refundMatch?.[1]) return { name: 'shippo-get-refund', refundId: refundMatch[1] };
	}
	if (method === 'POST' && pathname === '/transactions') return { name: 'shippo-create-transaction' };
	if (method === 'POST' && pathname === '/refunds') return { name: 'shippo-create-refund' };
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
		'id' in body ||
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

	return { email: body.email };
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

function parseTrustapTracking(body: unknown): TrustapTrackingRequest | undefined {
	if (!isRecord(body) || !isNonemptyString(body.carrier) || !isNonemptyString(body.tracking_code)) return undefined;
	return { carrier: body.carrier, tracking_code: body.tracking_code };
}

const trustapTransactionFeatures: ReadonlySet<string> = new Set([
	'require_seller_acceptance',
	'use_custom_postage_fee',
	'use_hr_post',
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

function parseShippoTransaction(body: unknown): { metadata: string; rate: string } | undefined {
	if (
		!isRecord(body) ||
		!isNonemptyString(body.rate) ||
		!isNonemptyString(body.metadata) ||
		body.async !== false ||
		body.label_file_type !== 'PDF'
	) {
		return undefined;
	}
	return { metadata: body.metadata, rate: body.rate };
}

function parseShippoRefund(body: unknown): { transaction: string } | undefined {
	if (!isRecord(body) || !isNonemptyString(body.transaction) || body.async !== false) return undefined;
	return { transaction: body.transaction };
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

function trustapCancellationResponse(
	transaction: TrustapTransactionResource,
	scenario: StubScenario,
): Record<string, unknown> {
	const mutations: Partial<Record<StubScenario, Record<string, unknown>>> = {
		'transaction-cancel-id-mismatch': { id: (BigInt(String(transaction.id)) + 1n).toString() },
		'transaction-cancel-buyer-mismatch': { buyer_id: 'unrelated-cancel-buyer' },
		'transaction-cancel-seller-mismatch': { seller_id: 'unrelated-cancel-seller' },
		'transaction-cancel-price-mismatch': { price: transaction.price + 1 },
		'transaction-cancel-charge-mismatch': { charge: transaction.charge + 1 },
		'transaction-cancel-charge-seller-mismatch': { charge_seller: transaction.charge_seller + 1 },
		'transaction-cancel-currency-mismatch': { currency: 'usd' },
		'transaction-cancel-description-mismatch': { description: `${transaction.description} changed` },
		'transaction-cancel-status-mismatch': { status: 'paid' },
	};
	return { ...trustapTransactionResponse(transaction, scenario), ...mutations[scenario] };
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
		case 'trustap-carriers-unsupported':
		case 'trustap-carriers-invalid-body':
		case 'trustap-carriers-malformed-json':
		case 'trustap-track-provider-error':
		case 'trustap-track-malformed-json':
		case 'trustap-track-id-mismatch':
		case 'trustap-track-disconnect':
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
		case 'shippo-rate-barrier':
		case 'shippo-label-invalid-body':
		case 'shippo-label-malformed-json':
		case 'shippo-label-delay':
		case 'shippo-label-disconnect':
		case 'shippo-label-client-error':
		case 'shippo-label-unauthorized':
		case 'shippo-label-forbidden':
		case 'shippo-label-not-found':
		case 'shippo-label-unprocessable':
		case 'shippo-label-request-timeout':
		case 'shippo-label-conflict':
		case 'shippo-label-too-early':
		case 'shippo-label-rate-limited':
		case 'shippo-label-provider-error':
		case 'shippo-label-status-error':
		case 'shippo-label-status-error-malformed':
		case 'shippo-label-status-error-rate-mismatch':
		case 'shippo-label-error-label-url':
		case 'shippo-label-error-commercial-invoice-url':
		case 'shippo-label-error-qr-code-url':
		case 'shippo-label-error-tracking-number':
		case 'shippo-label-error-tracking-url':
		case 'shippo-label-error-tracking-status':
		case 'shippo-label-rate-mismatch':
		case 'shippo-label-without-tracking':
		case 'shippo-label-disconnect-after-create':
		case 'shippo-label-barrier':
		case 'shippo-label-metadata-mismatch':
		case 'shippo-refund-pending':
		case 'shippo-refund-status-error':
		case 'shippo-refund-invalid-body':
		case 'shippo-refund-transaction-mismatch':
		case 'shippo-refund-disconnect-after-create':
		case 'shippo-refund-client-error':
		case 'shippo-refund-provider-error':
		case 'shippo-refund-get-provider-error':
		case 'shippo-reordered-rates':
		case 'shippo-address-mismatch':
		case 'shippo-create-metadata-mismatch':
		case 'shippo-create-address-mismatch':
		case 'shippo-create-parcel-mismatch':
		case 'shippo-create-reordered-rates':
		case 'shippo-create-rate-convertible-usd':
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
		case 'transaction-cancel-id-mismatch':
		case 'transaction-cancel-buyer-mismatch':
		case 'transaction-cancel-seller-mismatch':
		case 'transaction-cancel-price-mismatch':
		case 'transaction-cancel-charge-mismatch':
		case 'transaction-cancel-charge-seller-mismatch':
		case 'transaction-cancel-currency-mismatch':
		case 'transaction-cancel-description-mismatch':
		case 'transaction-cancel-status-mismatch':
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
	const trustapGuests = new Map<string, TrustapGuestResource>();
	const trustapTransactions = new Map<string, TrustapTransactionResource>([
		[String(trustapTransactionFixture.id), trustapTransactionFixture],
	]);
	let nextTrustapTransactionId = trustapTransactionFixture.id + 1;
	let nextTrustapGuestId = 101;
	const shippoShipments = new Map<string, typeof shippoShipmentFixture>();
	const shippoRateIds = new Set<string>();
	const shippoRates = new Map<string, typeof shippoRateFixture>();
	const shippoTransactions = new Set<string>();
	const shippoRefunds = new Map<string, ShippoRefundResource>();
	let nextShippoShipmentOrdinal = 1;
	let nextShippoTransactionOrdinal = 1;
	let nextShippoRefundOrdinal = 1;
	let shippoRateBarrierReached = 0;
	let releaseShippoRateBarrier: (() => void) | undefined;
	let shippoRateBarrier = new Promise<void>((resolve) => {
		releaseShippoRateBarrier = resolve;
	});
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
	const resetShippoRateBarrier = () => {
		shippoRateBarrierReached = 0;
		shippoRateBarrier = new Promise<void>((resolve) => {
			releaseShippoRateBarrier = resolve;
		});
	};

	const resetState = () => {
		requests = [];
		scenario = 'success';
		trustapHandshakes.clear();
		trustapGuests.clear();
		trustapTransactions.clear();
		trustapTransactions.set(String(trustapTransactionFixture.id), trustapTransactionFixture);
		nextTrustapTransactionId = trustapTransactionFixture.id + 1;
		nextTrustapGuestId = 101;
		shippoShipments.clear();
		shippoRateIds.clear();
		shippoRates.clear();
		shippoTransactions.clear();
		shippoRefunds.clear();
		nextShippoShipmentOrdinal = 1;
		nextShippoTransactionOrdinal = 1;
		nextShippoRefundOrdinal = 1;
		resetShippoRateBarrier();
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
					if (scenario === 'shippo-rate-barrier') resetShippoRateBarrier();
					if (scenario === 'shippo-label-barrier') resetShippoLabelBarrier();
					sendJson(response, 200, { scenario });
					return;
				}

				if (kind === 'shippo' && method === 'GET' && requestUrl.pathname === '/__test/label-barrier') {
					sendJson(response, 200, { reached: shippoLabelBarrierReached });
					return;
				}

				if (kind === 'shippo' && method === 'GET' && requestUrl.pathname === '/__test/rate-barrier') {
					sendJson(response, 200, { reached: shippoRateBarrierReached });
					return;
				}

				if (kind === 'shippo' && method === 'POST' && requestUrl.pathname === '/__test/rate-barrier/release') {
					releaseShippoRateBarrier?.();
					sendJson(response, 200, { released: true });
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
					const transactionId = canonicalStubTrustapId(isRecord(body) ? body.transaction_id : undefined);
					const status = isRecord(body) ? body.status : undefined;
					const chargePostageBuyer = isRecord(body) ? body.charge_postage_buyer : undefined;
					const chargePostageClient = isRecord(body) ? body.charge_postage_client : undefined;
					const description = isRecord(body) ? body.description : undefined;
					const tracking = isRecord(body) ? body.tracking : undefined;
					const transaction = transactionId ? trustapTransactions.get(transactionId) : undefined;
					if (!transaction || typeof status !== 'string') {
						sendJson(response, 404, { error: 'Trustap transaction control target not found' });
						return;
					}
					if (description !== undefined && !isNonemptyString(description)) {
						sendJson(response, 400, { error: 'Invalid Trustap transaction description' });
						return;
					}
					if (
						(chargePostageBuyer !== undefined && !isSafeInteger(chargePostageBuyer, 0)) ||
						(chargePostageClient !== undefined && !isSafeInteger(chargePostageClient, 0))
					) {
						sendJson(response, 400, { error: 'Invalid Trustap transaction postage charge' });
						return;
					}
					if (
						tracking !== undefined &&
						(!isRecord(tracking) || !isNonemptyString(tracking.carrier) || !isNonemptyString(tracking.tracking_code))
					) {
						sendJson(response, 400, { error: 'Invalid Trustap transaction tracking' });
						return;
					}
					trustapTransactions.set(String(transaction.id), {
						...transaction,
						status,
						...(typeof chargePostageBuyer === 'number' ? { charge_postage_buyer: chargePostageBuyer } : {}),
						...(typeof chargePostageClient === 'number' ? { charge_postage_client: chargePostageClient } : {}),
						...(typeof description === 'string' ? { description } : {}),
						...(isRecord(tracking)
							? { tracking: { carrier: tracking.carrier as string, tracking_code: tracking.tracking_code as string } }
							: {}),
					});
					sendJson(response, 200, { transaction_id: transactionId, status });
					return;
				}

				if (kind === 'trustap' && method === 'POST' && requestUrl.pathname === '/__test/transaction') {
					const body = await readJsonBody(request);
					const transactionId = canonicalStubTrustapId(isRecord(body) ? body.transaction_id : undefined);
					const buyerId = isRecord(body) ? body.buyer_id : undefined;
					const sellerId = isRecord(body) ? body.seller_id : undefined;
					if (!transactionId || !isNonemptyString(buyerId) || !isNonemptyString(sellerId)) {
						sendJson(response, 400, { error: 'Invalid Trustap transaction control fixture' });
						return;
					}
					trustapTransactions.set(transactionId, {
						...trustapTransactionFixture,
						id: transactionId,
						buyer_id: buyerId,
						seller_id: sellerId,
					});
					sendJson(response, 201, { transaction_id: transactionId });
					return;
				}

				if (kind === 'trustap' && method === 'GET' && requestUrl.pathname === '/__test/guest-identities') {
					sendJson(response, 200, [...trustapGuests.values()]);
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
				(route.name === 'trustap-guest-user' ||
					route.name === 'trustap-create-transaction' ||
					route.name === 'trustap-track-transaction') &&
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
			let trustapTracking: TrustapTrackingRequest | undefined;
			let shippoTransaction: { metadata: string; rate: string } | undefined;
			let shippoRefund: { transaction: string } | undefined;

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
				case 'trustap-track-transaction':
					trustapTracking = parseTrustapTracking(body);
					if (
						!trustapTracking ||
						trustapTracking.carrier !== 'poste-italiane' ||
						!isNonemptyString(headers['trustap-user'])
					) {
						sendValidationError(kind, response, 'Trustap tracking request is invalid');
						return;
					}
					break;
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
				case 'shippo-list-rates-in-currency':
					if (!shippoShipments.has(route.shipmentId) || route.currencyCode !== 'EUR') {
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
				case 'shippo-create-refund':
					shippoRefund = parseShippoRefund(body);
					if (!shippoRefund || !shippoTransactions.has(shippoRefund.transaction)) {
						sendValidationError(kind, response);
						return;
					}
					break;
				case 'shippo-get-refund':
					if (!shippoRefunds.has(route.refundId)) {
						sendNotFound(kind, response);
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
				case 'trustap-supported-carriers':
					break;
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
						const guest = {
							...trustapGuestUserFixture,
							email: trustapGuest.email,
							id: `guest-${nextTrustapGuestId}`,
						};
						nextTrustapGuestId += 1;
						trustapGuests.set(guest.id, guest);
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
						...(trustapCharge.postageFee === 0 ? {} : { charge_postage_buyer: trustapCharge.postageFee }),
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
						...(trustapTransaction.features?.includes('use_custom_postage_fee')
							? {
									charge_postage_buyer: trustapTransaction.postage_fee,
									charge_postage_client: 0,
								}
							: {}),
					};
					nextTrustapTransactionId += 1;
					trustapTransactions.set(String(transaction.id), transaction);
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
				case 'trustap-supported-carriers':
					if (scenario === 'trustap-carriers-invalid-body') {
						sendJson(response, 200, [{ code: '', name: 'Invalid carrier' }]);
						return;
					}
					if (scenario === 'trustap-carriers-malformed-json') {
						response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
						response.end('[{"code":');
						return;
					}
					if (scenario === 'trustap-carriers-unsupported') {
						sendJson(response, 200, [{ code: 'ups', name: 'UPS' }]);
						return;
					}
					sendJson(response, 200, [
						{ code: 'poste-italiane', name: 'Poste Italiane' },
						{ code: 'ups', name: 'UPS' },
					]);
					return;
				case 'trustap-track-transaction': {
					if (!trustapTracking) throw new Error('Validated Trustap tracking input is missing');
					if (scenario === 'trustap-track-provider-error') {
						sendProviderError(kind, response);
						return;
					}
					if (scenario === 'trustap-track-malformed-json') {
						response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
						response.end('{"id":');
						return;
					}
					if (scenario === 'trustap-track-disconnect') {
						response.destroy();
						return;
					}
					const tracked: TrustapTransactionResource = {
						...(trustapTransactions.get(route.transactionId) ?? trustapTransactionFixture),
						id: route.transactionId,
						seller_id: headers['trustap-user']!,
						status: 'tracked',
						tracked: '2026-08-30T12:30:00.000Z',
						tracking: trustapTracking,
					};
					trustapTransactions.set(route.transactionId, tracked);
					const trackingResponse = trustapTransactionResponse(tracked, scenario);
					sendJson(
						response,
						200,
						scenario === 'trustap-track-id-mismatch'
							? { ...trackingResponse, id: (BigInt(route.transactionId) + 1n).toString() }
							: trackingResponse,
					);
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
					const responseBody = trustapCancellationResponse(cancelled, scenario);
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
							const mismatched = {
								...shipment,
								rates: [{ ...shipment.rates[0], amount_local: '7.50', currency: 'USD', currency_local: 'USD' }],
							} as unknown as typeof shippoShipmentFixture;
							shippoShipments.set(shipmentId, mismatched);
							shippoRates.set(rateId, mismatched.rates[0]);
							sendJson(response, 201, mismatched);
							return;
						}
						if (scenario === 'shippo-create-rate-convertible-usd') {
							const normalized = {
								...shipment,
								address_from: {
									...shipment.address_from,
									phone: String(body.address_from.phone).replace(/^\+/, '00'),
								},
								address_to: {
									...shipment.address_to,
									phone: String(body.address_to.phone).replace(/^\+/, '00'),
								},
								parcels: shipment.parcels.map((parcel) => ({
									...parcel,
									height: `${parcel.height}.0000`,
									length: `${parcel.length}.0000`,
									weight: `${parcel.weight}.0000`,
									width: `${parcel.width}.0000`,
								})),
								rates: [{ ...shipment.rates[0], amount_local: '7.50', currency: 'USD', currency_local: 'USD' }],
							} as unknown as typeof shippoShipmentFixture;
							shippoShipments.set(shipmentId, normalized);
							shippoRates.set(rateId, normalized.rates[0]);
							sendJson(response, 201, normalized);
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
				case 'shippo-list-rates-in-currency': {
					const shipment = shippoShipments.get(route.shipmentId);
					if (!shipment) throw new Error('Known Shippo shipment is missing');
					if (scenario === 'shippo-create-rate-currency-mismatch') {
						sendJson(response, 200, { results: shipment.rates });
						return;
					}
					if (scenario === 'shippo-rate-currency-mismatch') {
						sendJson(response, 200, {
							results: shipment.rates.map((rate) => ({
								...rate,
								currency: 'USD',
								currency_local: 'USD',
							})),
						});
						return;
					}
					const convertedRates = shipment.rates.map((rate) => ({
						...rate,
						amount_local: '6.95',
						currency_local: 'EUR',
					}));
					sendJson(response, 200, { results: convertedRates });
					return;
				}
				case 'shippo-get-rate': {
					const rate = shippoRates.get(route.rateId);
					if (!rate) throw new Error('Known Shippo rate is missing');
					if (scenario === 'shippo-rate-barrier') {
						shippoRateBarrierReached += 1;
						await shippoRateBarrier;
					}
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
						sendJson(response, 200, { ...rate, currency: 'USD', currency_local: 'USD' });
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
						metadata: shippoTransaction.metadata,
						object_id: `${shippoTransactionFixture.object_id}${suffix}`,
						rate: shippoTransaction.rate,
					};
					shippoTransactions.add(transaction.object_id);
					if (scenario === 'shippo-label-barrier') {
						shippoLabelBarrierReached += 1;
						await shippoLabelBarrier;
					}
					if (scenario === 'shippo-label-disconnect-after-create') {
						response.destroy();
						return;
					}
					if (scenario === 'shippo-label-client-error') {
						sendJson(response, 400, { error: 'invalid_rate', message: 'The requested rate cannot be purchased' });
						return;
					}
					const definiteHttpStatuses: Partial<Record<StubScenario, number>> = {
						'shippo-label-unauthorized': 401,
						'shippo-label-forbidden': 403,
						'shippo-label-not-found': 404,
					};
					const definiteHttpStatus = definiteHttpStatuses[scenario];
					if (definiteHttpStatus) {
						sendJson(response, definiteHttpStatus, {
							error: 'request_rejected',
							message: 'The request was definitively rejected',
						});
						return;
					}
					if (scenario === 'shippo-label-unprocessable') {
						sendJson(response, 422, { error: 'unprocessable', message: 'The requested label is invalid' });
						return;
					}
					const ambiguousHttpStatuses: Partial<Record<StubScenario, number>> = {
						'shippo-label-request-timeout': 408,
						'shippo-label-conflict': 409,
						'shippo-label-too-early': 425,
						'shippo-label-rate-limited': 429,
					};
					const ambiguousHttpStatus = ambiguousHttpStatuses[scenario];
					if (ambiguousHttpStatus) {
						sendJson(response, ambiguousHttpStatus, {
							error: 'ambiguous_request',
							message: 'The request outcome is not proven',
						});
						return;
					}
					if (scenario === 'shippo-label-provider-error') {
						sendJson(response, 500, { error: 'provider_error', message: 'Shippo provider error' });
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
					const cleanErrorTransaction = {
						label_file_type: transaction.label_file_type,
						messages: transaction.messages,
						metadata: transaction.metadata,
						object_created: transaction.object_created,
						object_id: transaction.object_id,
						object_owner: transaction.object_owner,
						object_state: transaction.object_state,
						object_updated: transaction.object_updated,
						rate: transaction.rate,
						status: 'ERROR',
						test: transaction.test,
					};
					if (scenario === 'shippo-label-status-error') {
						sendJson(response, 201, cleanErrorTransaction);
						return;
					}
					if (scenario === 'shippo-label-status-error-malformed') {
						sendJson(response, 201, { ...cleanErrorTransaction, object_id: undefined });
						return;
					}
					if (scenario === 'shippo-label-status-error-rate-mismatch') {
						sendJson(response, 201, { ...cleanErrorTransaction, rate: 'rate-other' });
						return;
					}
					const contradictoryErrorEvidence: Partial<Record<StubScenario, Record<string, unknown>>> = {
						'shippo-label-error-label-url': { label_url: transaction.label_url },
						'shippo-label-error-commercial-invoice-url': {
							commercial_invoice_url: 'https://labels.test/commercial-invoice.pdf',
						},
						'shippo-label-error-qr-code-url': { qr_code_url: 'https://labels.test/qr-code.png' },
						'shippo-label-error-tracking-number': { tracking_number: transaction.tracking_number },
						'shippo-label-error-tracking-url': { tracking_url_provider: transaction.tracking_url_provider },
						'shippo-label-error-tracking-status': { tracking_status: 'TRANSIT' },
					};
					const contradictoryEvidence = contradictoryErrorEvidence[scenario];
					if (contradictoryEvidence) {
						sendJson(response, 201, { ...cleanErrorTransaction, ...contradictoryEvidence });
						return;
					}
					if (scenario === 'shippo-label-rate-mismatch') {
						sendJson(response, 201, { ...transaction, rate: 'rate-other' });
						return;
					}
					if (scenario === 'shippo-label-metadata-mismatch') {
						sendJson(response, 201, { ...transaction, metadata: 'tampered-label-metadata' });
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
				case 'shippo-create-refund': {
					if (!shippoRefund) throw new Error('Validated Shippo refund input is missing');
					const suffix = nextShippoRefundOrdinal === 1 ? '' : `-${nextShippoRefundOrdinal}`;
					nextShippoRefundOrdinal += 1;
					const refund = {
						...shippoRefundFixture,
						object_id: `${shippoRefundFixture.object_id}${suffix}`,
						status: scenario === 'shippo-refund-pending' ? ('PENDING' as const) : shippoRefundFixture.status,
						transaction: shippoRefund.transaction,
					};
					shippoRefunds.set(refund.object_id, refund);
					if (scenario === 'shippo-refund-disconnect-after-create') {
						response.destroy();
						return;
					}
					if (scenario === 'shippo-refund-client-error') {
						sendJson(response, 422, { detail: 'The label is not eligible for refund' });
						return;
					}
					if (scenario === 'shippo-refund-provider-error') {
						sendJson(response, 500, { detail: 'Shippo refund provider error' });
						return;
					}
					if (scenario === 'shippo-refund-invalid-body') {
						sendJson(response, 201, { ...refund, object_id: '' });
						return;
					}
					if (scenario === 'shippo-refund-transaction-mismatch') {
						sendJson(response, 201, { ...refund, transaction: 'label-transaction-other' });
						return;
					}
					if (scenario === 'shippo-refund-status-error') {
						sendJson(response, 201, { ...refund, status: 'ERROR' });
						return;
					}
					sendJson(response, 201, refund);
					return;
				}
				case 'shippo-get-refund': {
					const refund = shippoRefunds.get(route.refundId);
					if (!refund) throw new Error('Known Shippo refund is missing');
					if (scenario === 'shippo-refund-get-provider-error') {
						sendJson(response, 500, { detail: 'Shippo refund retrieval error' });
						return;
					}
					const refreshed =
						scenario === 'success' && refund.status === 'PENDING' ? { ...refund, status: 'SUCCESS' as const } : refund;
					shippoRefunds.set(route.refundId, refreshed);
					sendJson(response, 200, refreshed);
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
