import { timingSafeEqual } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import { PaymentProviderService } from '../../src/routes/payments/payment-provider.service';
import {
	trustapChargeResponseSchema,
	trustapGuestUserResponseSchema,
	trustapTransactionResponseSchema,
} from '../../src/routes/payments/provider.schemas';
import { resolveTrustapOrderTransition, trustapToOrderPhase } from '../../src/routes/payments/trustap-order-state';
import type { CreateGuestUserProps, CreateTransactionWithBothUsersProps } from '../../src/routes/payments/types';
import { environment } from '../../src/utils/constants';
import type { StubScenario } from '../infrastructure/provider-stubs';
import { getProviderRequests, setProviderScenario } from '../helpers/providers';

const guestInput = {
	id: 101,
	email: 'buyer@tantovale.test',
	first_name: 'Buyer',
	last_name: 'Boundary',
	country_code: 'IT',
	tos_acceptance: { unix_timestamp: 1_700_000_000, ip: '127.0.0.1' },
} satisfies CreateGuestUserProps;

const transactionInput = {
	buyer_id: 'guest-buyer-test',
	seller_id: 'guest-seller-test',
	creator_role: 'buyer',
	currency: 'eur',
	description: 'Trustap v1 boundary listing',
	price: 12_500,
	postage_fee: 875,
	charge: 625,
	charge_calculator_version: 1,
} satisfies CreateTransactionWithBothUsersProps;

const existingTransactionId = '91001';

type OperationName = 'create_guest_user' | 'calculate_charge' | 'create_transaction' | 'fetch_transaction';

type BoundaryOperation = {
	name: OperationName;
	prepare?: () => Promise<void>;
	invoke: () => Promise<unknown>;
};

function paymentProviderUrl(): string {
	return environment.PAYMENT_PROVIDER_API_URL;
}

function paymentProviderKey(): string {
	return environment.PAYMENT_PROVIDER_API_KEY;
}

function boundaryOperations(): BoundaryOperation[] {
	const service = new PaymentProviderService();
	const calculateHandshake = async (): Promise<void> => {
		await service.calculateTransactionFee({
			price: transactionInput.price,
			currency: transactionInput.currency,
			postage_fee: transactionInput.postage_fee,
			use_hr_post: false,
		});
	};

	return [
		{
			name: 'create_guest_user',
			invoke: () => service.createGuestUser(guestInput),
		},
		{
			name: 'calculate_charge',
			invoke: () =>
				service.calculateTransactionFee({
					price: transactionInput.price,
					currency: transactionInput.currency,
					postage_fee: transactionInput.postage_fee,
					use_hr_post: false,
				}),
		},
		{
			name: 'create_transaction',
			prepare: calculateHandshake,
			invoke: () => service.createTransactionWithBothUsers(transactionInput),
		},
		{
			name: 'fetch_transaction',
			invoke: () => service.getTransactionStatus(existingTransactionId),
		},
	];
}

function scenarioFor(operation: OperationName, kind: 'malformed' | 'timeout' | 'connection'): StubScenario {
	const scenarios: Record<OperationName, Record<typeof kind, string>> = {
		create_guest_user: {
			malformed: 'guest-malformed-json',
			timeout: 'guest-timeout',
			connection: 'guest-disconnect-after-create',
		},
		calculate_charge: {
			malformed: 'charge-malformed-json',
			timeout: 'charge-delay',
			connection: 'charge-disconnect',
		},
		create_transaction: {
			malformed: 'transaction-invalid-json',
			timeout: 'transaction-delay',
			connection: 'transaction-disconnect',
		},
		fetch_transaction: {
			malformed: 'transaction-fetch-malformed-json',
			timeout: 'transaction-delay',
			connection: 'transaction-fetch-disconnect',
		},
	};
	return scenarios[operation][kind] as StubScenario;
}

async function capturedError(operation: BoundaryOperation, scenario: StubScenario): Promise<Error> {
	await operation.prepare?.();
	await setProviderScenario(paymentProviderUrl(), scenario);
	try {
		await operation.invoke();
	} catch (error) {
		if (error instanceof Error) return error;
		throw new Error('Trustap boundary threw a non-Error value');
	}
	throw new Error(`Trustap ${operation.name} unexpectedly succeeded`);
}

function assertTypedRedactedError(
	error: Error,
	operation: OperationName,
	expected: { category: string; status?: number },
): void {
	expect(error).toMatchObject({
		name: expect.stringMatching(/^PaymentProvider/u),
		provider: 'trustap',
		operation,
		category: expected.category,
		...(expected.status === undefined ? {} : { status: expected.status }),
	});

	const snapshot = JSON.stringify({
		name: error.name,
		message: error.message,
		...Object.fromEntries(Object.entries(error)),
	});
	const authorization = `Basic ${Buffer.from(`${paymentProviderKey()}:`).toString('base64')}`;
	for (const sensitiveValue of [
		paymentProviderKey(),
		authorization,
		'Trustap API credentials are invalid',
		'Provider could not safely classify outcome',
		'Trustap provider error',
	]) {
		expect(snapshot.includes(sensitiveValue)).toBe(false);
	}
}

function assertBasicApiKey(header: string | undefined): void {
	expect(header?.startsWith('Basic ')).toBe(true);
	const actual = Buffer.from(header?.slice('Basic '.length) ?? '', 'base64');
	const expected = Buffer.from(`${paymentProviderKey()}:`);
	expect(actual.byteLength).toBe(expected.byteLength);
	expect(timingSafeEqual(actual, expected)).toBe(true);
}

describe('Trustap v1 provider boundary', () => {
	it('pins exact success methods, paths, headers, integer cents, identities, and response schemas', async () => {
		const service = new PaymentProviderService();
		const guest = await service.createGuestUser(guestInput);
		const charge = await service.calculateTransactionFee({
			price: transactionInput.price,
			currency: transactionInput.currency,
			postage_fee: transactionInput.postage_fee,
			use_hr_post: false,
		});
		expect(charge).toEqual({
			charge: 625,
			charge_buyer_client: 0,
			charge_calculator_version: 1,
			charge_seller: 0,
			charge_seller_client: 0,
			currency: 'eur',
			price: 12_500,
		});

		const transaction = await service.createTransactionWithBothUsers({
			...transactionInput,
			charge: charge!.charge,
			charge_calculator_version: charge!.charge_calculator_version,
		});
		const fetched = await service.getTransactionStatus(transaction!.id);

		expect(guest).toEqual({
			created_at: '2026-08-30T12:00:00.000Z',
			email: guestInput.email,
			id: `guest-${guestInput.id}`,
		});
		expect(transaction).toEqual({
			buyer_id: transactionInput.buyer_id,
			charge: charge!.charge,
			charge_buyer_client: 0,
			charge_seller: 0,
			charge_seller_client: 0,
			client_id: 'trustap-test-client',
			created: '2026-08-30T12:00:00.000Z',
			currency: 'eur',
			description: transactionInput.description,
			id: '91002',
			is_payment_in_progress: false,
			price: transactionInput.price,
			quantity: 1,
			seller_id: transactionInput.seller_id,
			status: 'created',
		});
		expect(fetched).toEqual(transaction);
		expect(Number.isSafeInteger(charge!.price)).toBe(true);
		expect(Number.isSafeInteger(charge!.charge)).toBe(true);
		expect((charge as { postage_fee?: unknown }).postage_fee).toBeUndefined();
		expect((transaction as { postage_fee?: unknown }).postage_fee).toBeUndefined();
		expect((fetched as { postage_fee?: unknown }).postage_fee).toBeUndefined();

		const requests = await getProviderRequests(paymentProviderUrl());
		expect(requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
			{ method: 'POST', path: '/api/v1/guest_users', body: guestInput },
			{
				method: 'GET',
				path: '/api/v1/charge?price=12500&currency=eur&postage_fee=875&use_hr_post=false',
				body: undefined,
			},
			{
				method: 'POST',
				path: '/api/v1/me/transactions/create_with_guest_user',
				body: transactionInput,
			},
			{ method: 'GET', path: '/api/v1/transactions/91002', body: undefined },
		]);
		for (const request of requests) assertBasicApiKey(request.headers.authorization);
		expect(requests[0]?.headers['content-type']).toBe('application/json');
		expect(requests[2]?.headers['content-type']).toBe('application/json');
		expect(requests.map((request) => request.headers['trustap-user'])).toEqual([
			undefined,
			undefined,
			transactionInput.buyer_id,
			undefined,
		]);
	});

	it('binds Trustap-User to the seller when the seller is the declared creator', async () => {
		const service = new PaymentProviderService();
		const charge = await service.calculateTransactionFee({
			price: transactionInput.price,
			currency: transactionInput.currency,
			postage_fee: transactionInput.postage_fee,
			use_hr_post: false,
		});
		const sellerTransaction = {
			...transactionInput,
			creator_role: 'seller' as const,
			charge: charge!.charge,
			charge_calculator_version: charge!.charge_calculator_version,
		};
		await service.createTransactionWithBothUsers(sellerTransaction);

		const requests = await getProviderRequests(paymentProviderUrl());
		expect(requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
			{
				method: 'GET',
				path: '/api/v1/charge?price=12500&currency=eur&postage_fee=875&use_hr_post=false',
				body: undefined,
			},
			{
				method: 'POST',
				path: '/api/v1/me/transactions/create_with_guest_user',
				body: sellerTransaction,
			},
		]);
		assertBasicApiKey(requests[1]?.headers.authorization);
		expect(requests[1]?.headers['trustap-user']).toBe(transactionInput.seller_id);
	});

	it('rejects fractional wire values, non-eur currency, unknown status, and legacy response typos', () => {
		const validCharge = {
			charge: 625,
			charge_buyer_client: 0,
			charge_calculator_version: 1,
			charge_seller: 0,
			charge_seller_client: 0,
			currency: 'eur',
			price: 12_500,
		};
		const validTransaction = {
			buyer_id: transactionInput.buyer_id,
			charge: 625,
			charge_buyer_client: 0,
			charge_seller: 0,
			charge_seller_client: 0,
			client_id: 'trustap-test-client',
			created: '2026-08-30T12:00:00.000Z',
			currency: 'eur',
			description: transactionInput.description,
			id: 91_001,
			is_payment_in_progress: false,
			price: 12_500,
			quantity: 1,
			seller_id: transactionInput.seller_id,
			status: 'created',
		};
		expect([
			trustapGuestUserResponseSchema.safeParse({
				created_at: '2026-08-30T12:00:00.000Z',
				email: guestInput.email,
				id: 101,
			}).success,
			trustapChargeResponseSchema.safeParse({ ...validCharge, charge: 1.5 }).success,
			trustapChargeResponseSchema.safeParse({ ...validCharge, currency: 'usd' }).success,
			trustapChargeResponseSchema.safeParse({
				charge: validCharge.charge,
				charge_buyer_client: validCharge.charge_buyer_client,
				charge_calculator_version: validCharge.charge_calculator_version,
				charge_seller: validCharge.charge_seller,
				charge_seller_client: validCharge.charge_seller_client,
				currency: validCharge.currency,
				pirce: validCharge.price,
			}).success,
			trustapTransactionResponseSchema.safeParse({ ...validTransaction, id: 91_001.5 }).success,
			trustapTransactionResponseSchema.safeParse({ ...validTransaction, price: 12_500.5 }).success,
			trustapTransactionResponseSchema.safeParse({ ...validTransaction, status: 'fund_released' }).success,
		]).toEqual([false, false, false, false, false, false, false]);
		expect(trustapChargeResponseSchema.safeParse(validCharge).success).toBe(true);
		expect(trustapTransactionResponseSchema.safeParse(validTransaction).success).toBe(true);
		expect(trustapTransactionResponseSchema.safeParse({ ...validTransaction, status: 'funds_released' }).success).toBe(
			true,
		);
	});

	it('rejects missing or wrong JSON Content-Type on both Trustap POST boundaries', async () => {
		const authorization = `Basic ${Buffer.from(`${paymentProviderKey()}:`).toString('base64')}`;
		const service = new PaymentProviderService();
		const charge = await service.calculateTransactionFee({
			price: transactionInput.price,
			currency: transactionInput.currency,
			postage_fee: transactionInput.postage_fee,
			use_hr_post: false,
		});
		const postCases = [
			{ path: '/api/v1/guest_users', body: guestInput, trustapUser: undefined },
			{
				path: '/api/v1/me/transactions/create_with_guest_user',
				body: {
					...transactionInput,
					charge: charge!.charge,
					charge_calculator_version: charge!.charge_calculator_version,
				},
				trustapUser: transactionInput.buyer_id,
			},
		];

		for (const postCase of postCases) {
			for (const contentType of [undefined, 'text/plain']) {
				const serializedBody = JSON.stringify(postCase.body);
				const response = await fetch(`${paymentProviderUrl()}${postCase.path}`, {
					method: 'POST',
					headers: {
						authorization,
						...(contentType ? { 'content-type': contentType } : {}),
						...(postCase.trustapUser ? { 'trustap-user': postCase.trustapUser } : {}),
					},
					// A byte body avoids Undici's automatic text/plain header and proves the truly missing-header case.
					body: contentType === undefined ? Buffer.from(serializedBody) : serializedBody,
				});
				expect(response.status).toBe(400);
				expect(await response.json()).toEqual({
					error: 'invalid_request',
					message: 'Trustap Content-Type must be application/json',
				});
			}
		}
	});

	it('rejects an unsupported transaction feature instead of accepting an invented custom-postage flag', async () => {
		const service = new PaymentProviderService();
		const charge = await service.calculateTransactionFee({
			price: transactionInput.price,
			currency: transactionInput.currency,
			postage_fee: transactionInput.postage_fee,
			use_hr_post: false,
		});
		const response = await fetch(`${paymentProviderUrl()}/api/v1/me/transactions/create_with_guest_user`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Basic ${Buffer.from(`${paymentProviderKey()}:`).toString('base64')}`,
				'trustap-user': transactionInput.buyer_id,
			},
			body: JSON.stringify({
				...transactionInput,
				charge: charge!.charge,
				charge_calculator_version: charge!.charge_calculator_version,
				features: ['use_custom_postage_fee'],
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'invalid_request',
			message: 'Unsupported Trustap transaction feature',
		});
	});

	it.each([401, 422, 500] as const)(
		'returns typed redacted errors for HTTP %i from every operation',
		async (status) => {
			const scenario = ({ 401: 'unauthorized', 422: 'unprocessable', 500: 'provider-error' } as const)[status];
			for (const operation of boundaryOperations()) {
				const error = await capturedError(operation, scenario);
				assertTypedRedactedError(error, operation.name, {
					category: operation.name === 'create_transaction' && status !== 401 ? 'ambiguous' : 'http',
					...(operation.name === 'create_transaction' && status !== 401 ? {} : { status }),
				});
				await setProviderScenario(paymentProviderUrl(), 'success');
			}
		},
	);

	it.each(['malformed', 'timeout', 'connection'] as const)(
		'returns typed redacted errors for %s responses from every operation',
		async (failureKind) => {
			for (const operation of boundaryOperations()) {
				const error = await capturedError(operation, scenarioFor(operation.name, failureKind));
				assertTypedRedactedError(error, operation.name, {
					category:
						operation.name === 'create_transaction'
							? 'ambiguous'
							: failureKind === 'malformed'
								? 'invalid_response'
								: 'network',
				});
				await setProviderScenario(paymentProviderUrl(), 'success');
			}
		},
	);

	it.each([
		{ field: 'charge', value: transactionInput.charge + 1 },
		{ field: 'charge_calculator_version', value: transactionInput.charge_calculator_version + 1 },
	] as const)('rejects a transaction whose $field does not bind the prior fee result', async ({ field, value }) => {
		const service = new PaymentProviderService();
		const charge = await service.calculateTransactionFee({
			price: transactionInput.price,
			currency: transactionInput.currency,
			postage_fee: transactionInput.postage_fee,
			use_hr_post: false,
		});
		const error = await service
			.createTransactionWithBothUsers({
				...transactionInput,
				charge: charge!.charge,
				charge_calculator_version: charge!.charge_calculator_version,
				[field]: value,
			})
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(Error);
		assertTypedRedactedError(error as Error, 'create_transaction', { category: 'http', status: 400 });
	});

	it('rejects schema-invalid success payloads instead of returning unsafe casts', async () => {
		const service = new PaymentProviderService();
		const cases = [
			{
				scenario: 'guest-invalid-body' as const,
				operation: 'create_guest_user' as const,
				invoke: () => service.createGuestUser(guestInput),
			},
			{
				scenario: 'charge-currency-mismatch' as const,
				operation: 'calculate_charge' as const,
				invoke: () =>
					service.calculateTransactionFee({
						price: transactionInput.price,
						currency: transactionInput.currency,
						postage_fee: transactionInput.postage_fee,
					}),
			},
			{
				scenario: 'transaction-fetch-invalid-body' as StubScenario,
				operation: 'fetch_transaction' as const,
				invoke: () => service.getTransactionStatus(existingTransactionId),
			},
		];

		for (const testCase of cases) {
			await setProviderScenario(paymentProviderUrl(), testCase.scenario);
			const error = await testCase.invoke().catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(Error);
			assertTypedRedactedError(error as Error, testCase.operation, { category: 'invalid_response' });
			await setProviderScenario(paymentProviderUrl(), 'success');
		}
	});

	it('uses one explicit order mapping and preserves the order phase for complaints', () => {
		expect(trustapToOrderPhase).toEqual({
			created: ORDER_PHASES.PAYMENT_PENDING,
			joined: ORDER_PHASES.PAYMENT_PENDING,
			paid: ORDER_PHASES.PAYMENT_CONFIRMED,
			rejected: ORDER_PHASES.PAYMENT_FAILED,
			cancelled: ORDER_PHASES.CANCELLED,
			tracked: ORDER_PHASES.SHIPPING_CONFIRMED,
			cancelled_with_payment: ORDER_PHASES.PAYMENT_REFUNDED,
			payment_refunded: ORDER_PHASES.PAYMENT_REFUNDED,
			delivered: ORDER_PHASES.COMPLETED,
			complaint_period_ended: ORDER_PHASES.COMPLETED,
			funds_released: ORDER_PHASES.COMPLETED,
		});
		expect(resolveTrustapOrderTransition('delivered', ORDER_PHASES.COMPLETED, 'complained')).toEqual({
			apply: true,
			providerStatus: 'complained',
			orderStatus: ORDER_PHASES.COMPLETED,
		});
	});

	it('does not log credentials or provider bodies at the boundary', async () => {
		const consoleSpies = [
			vi.spyOn(console, 'log').mockImplementation(() => undefined),
			vi.spyOn(console, 'warn').mockImplementation(() => undefined),
			vi.spyOn(console, 'error').mockImplementation(() => undefined),
		];
		try {
			for (const operation of boundaryOperations()) {
				await capturedError(operation, 'provider-error');
				await setProviderScenario(paymentProviderUrl(), 'success');
			}
			for (const spy of consoleSpies) expect(spy).toHaveBeenCalledTimes(0);
		} finally {
			for (const spy of consoleSpies) spy.mockRestore();
		}
	});
});
