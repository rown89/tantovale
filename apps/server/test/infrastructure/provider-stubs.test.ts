import { describe, expect, it, onTestFinished } from 'vitest';
import {
	carrierAccountPaginatedListFromJSON,
	shipmentFromJSON,
	transactionFromJSON,
} from 'shippo/models/components/index.js';

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
import { getProviderRequests, resetProviderStub, resetProviderStubs, setProviderScenario } from '../helpers/providers';
import { startProviderStub, type StartedProviderStub, type StubScenario } from './provider-stubs';

function requiredTestEnvironment(name: 'PAYMENT_PROVIDER_API_KEY' | 'SHIPPING_PROVIDER_API_KEY'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing provider test environment key ${name}`);
	return value;
}

function trustapHeaders(trustapUser?: string): {
	authorization: string;
	'content-type': string;
	'trustap-user'?: string;
} {
	return {
		authorization: `Basic ${Buffer.from(`${requiredTestEnvironment('PAYMENT_PROVIDER_API_KEY')}:`).toString('base64')}`,
		'content-type': 'application/json',
		...(trustapUser ? { 'trustap-user': trustapUser } : {}),
	};
}

function shippoHeaders(): {
	authorization: string;
	'content-type': string;
	'shippo-api-version': string;
} {
	return {
		authorization: `ShippoToken ${requiredTestEnvironment('SHIPPING_PROVIDER_API_KEY')}`,
		'content-type': 'application/json',
		'shippo-api-version': '2018-02-08',
	};
}

const validGuestBody = {
	id: 101,
	email: 'buyer@tantovale.test',
	first_name: 'Buyer',
	last_name: 'Test',
	country_code: 'IT',
	tos_acceptance: { unix_timestamp: 1_700_000_000, ip: '127.0.0.1' },
};

const validTrustapTransactionBody = {
	buyer_id: 'guest-buyer-test',
	seller_id: 'guest-seller-test',
	creator_role: 'buyer',
	currency: 'eur',
	description: 'Test listing',
	price: 10_000,
	postage_fee: 750,
	charge: 500,
	charge_calculator_version: 1,
};

const validShippoShipmentBody = {
	address_from: { country: 'IT' },
	address_to: { country: 'IT' },
	parcels: [
		{
			distance_unit: 'cm',
			height: '10',
			length: '20',
			mass_unit: 'g',
			weight: '1',
			width: '15',
		},
	],
};

async function startStub(kind: 'trustap' | 'shippo'): Promise<StartedProviderStub> {
	const stub = await startProviderStub(kind);
	onTestFinished(async () => {
		try {
			await stub.close();
		} catch (error) {
			throw new AggregateError([error], `Failed to close ${kind} provider stub after test`);
		}
	});
	return stub;
}

async function assertTrustapContract(stub: StartedProviderStub): Promise<void> {
	const headers = trustapHeaders();
	const authorization = headers.authorization;
	const guestBody = validGuestBody;
	const transactionBody = validTrustapTransactionBody;

	const responses = [
		await fetch(`${stub.url}/api/v1/guest_users`, {
			method: 'POST',
			headers,
			body: JSON.stringify(guestBody),
		}),
		await fetch(`${stub.url}/api/v1/charge?price=10000&currency=eur&postage_fee=750&use_hr_post=false`, {
			headers: { authorization },
		}),
		await fetch(`${stub.url}/api/v1/me/transactions/create_with_guest_user`, {
			method: 'POST',
			headers: trustapHeaders(transactionBody.buyer_id),
			body: JSON.stringify(transactionBody),
		}),
		await fetch(`${stub.url}/api/v1/transactions/91001`, { headers: { authorization } }),
	];

	expect(responses.map((response) => response.status)).toEqual([201, 200, 201, 200]);
	expect(await Promise.all(responses.map((response) => response.json()))).toEqual([
		trustapGuestUserFixture,
		trustapChargeFixture,
		{ ...trustapTransactionFixture, id: trustapTransactionFixture.id + 1 },
		trustapTransactionFixture,
	]);

	const requests = await getProviderRequests(stub.url);
	expect(requests).toHaveLength(4);
	expect(requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
		{ method: 'POST', path: '/api/v1/guest_users', body: guestBody },
		{
			method: 'GET',
			path: '/api/v1/charge?price=10000&currency=eur&postage_fee=750&use_hr_post=false',
			body: undefined,
		},
		{
			method: 'POST',
			path: '/api/v1/me/transactions/create_with_guest_user',
			body: transactionBody,
		},
		{ method: 'GET', path: '/api/v1/transactions/91001', body: undefined },
	]);
	expect(requests.map((request) => request.headers.authorization)).toEqual(Array(4).fill(authorization));
}

async function assertShippoContract(stub: StartedProviderStub): Promise<void> {
	const headers = shippoHeaders();
	const shipmentBody = validShippoShipmentBody;
	const transactionBody = { rate: 'rate-test', label_file_type: 'PDF', async: false };

	const responses = [
		await fetch(`${stub.url}/carrier_accounts`, { headers }),
		await fetch(`${stub.url}/shipments`, {
			method: 'POST',
			headers,
			body: JSON.stringify(shipmentBody),
		}),
		await fetch(`${stub.url}/shipments/shipment-test`, { headers }),
		await fetch(`${stub.url}/transactions`, {
			method: 'POST',
			headers,
			body: JSON.stringify(transactionBody),
		}),
	];

	expect(responses.map((response) => response.status)).toEqual([200, 201, 200, 201]);
	expect(await Promise.all(responses.map((response) => response.json()))).toEqual([
		shippoCarrierAccountsFixture,
		shippoShipmentFixture,
		shippoShipmentFixture,
		shippoTransactionFixture,
	]);

	const requests = await getProviderRequests(stub.url);
	expect(requests).toHaveLength(4);
	expect(requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
		{ method: 'GET', path: '/carrier_accounts', body: undefined },
		{ method: 'POST', path: '/shipments', body: shipmentBody },
		{ method: 'GET', path: '/shipments/shipment-test', body: undefined },
		{ method: 'POST', path: '/transactions', body: transactionBody },
	]);
	expect(requests.map((request) => request.headers['shippo-api-version'])).toEqual(Array(4).fill('2018-02-08'));
	expect(requests.map((request) => request.headers.authorization)).toEqual(
		Array(4).fill(`ShippoToken ${requiredTestEnvironment('SHIPPING_PROVIDER_API_KEY')}`),
	);
}

describe('local commerce provider stubs', () => {
	it('starts one isolated pair and exercises all Trustap v1 and Shippo 2018-02-08 success endpoints', async () => {
		const [trustap, shippo] = await Promise.all([startStub('trustap'), startStub('shippo')]);

		await assertTrustapContract(trustap);
		await assertShippoContract(shippo);
	});

	it('derives distinct deterministic Trustap guest identities from each validated request', async () => {
		const stub = await startStub('trustap');
		const createGuest = async (id: number, email: string) => {
			const response = await fetch(`${stub.url}/api/v1/guest_users`, {
				method: 'POST',
				headers: trustapHeaders(),
				body: JSON.stringify({ ...validGuestBody, id, email }),
			});
			expect(response.status).toBe(201);
			return (await response.json()) as { created_at: string; email: string; id: string };
		};

		const buyer = await createGuest(101, 'buyer@tantovale.test');
		const seller = await createGuest(202, 'seller@tantovale.test');
		const repeatedBuyer = await createGuest(101, 'buyer-updated@tantovale.test');

		expect(buyer).toMatchObject({ email: 'buyer@tantovale.test' });
		expect(seller).toMatchObject({ email: 'seller@tantovale.test' });
		expect(repeatedBuyer).toMatchObject({ email: 'buyer-updated@tantovale.test', id: buyer.id });
		expect(seller.id).not.toBe(buyer.id);
	});

	it('requires exact Trustap Basic authentication on every provider route', async () => {
		const stub = await startStub('trustap');
		const cases: Array<{ method: string; path: string; body?: unknown }> = [
			{ method: 'POST', path: '/api/v1/guest_users', body: validGuestBody },
			{
				method: 'GET',
				path: '/api/v1/charge?price=10000&currency=eur&postage_fee=750&use_hr_post=false',
			},
			{
				method: 'POST',
				path: '/api/v1/me/transactions/create_with_guest_user',
				body: validTrustapTransactionBody,
			},
			{ method: 'GET', path: '/api/v1/transactions/91001' },
		];

		for (const authorization of [undefined, 'Basic invalid']) {
			for (const testCase of cases) {
				const response = await fetch(`${stub.url}${testCase.path}`, {
					method: testCase.method,
					headers: {
						'content-type': 'application/json',
						...(authorization ? { authorization } : {}),
					},
					body: testCase.body === undefined ? undefined : JSON.stringify(testCase.body),
				});
				expect(response.status).toBe(401);
				expect(await response.json()).toEqual({
					error: 'unauthorized',
					message: 'Trustap API credentials are invalid',
				});
			}
		}
	});

	it('validates Trustap request types, numeric transaction IDs, and the charge handshake', async () => {
		const stub = await startStub('trustap');
		const authenticated = trustapHeaders();

		expect(
			(
				await fetch(`${stub.url}/api/v1/guest_users`, {
					method: 'POST',
					headers: authenticated,
					body: JSON.stringify({ ...validGuestBody, id: '101' }),
				})
			).status,
		).toBe(400);
		expect(
			(
				await fetch(`${stub.url}/api/v1/charge?price=100.5&currency=eur&postage_fee=750&use_hr_post=false`, {
					headers: authenticated,
				})
			).status,
		).toBe(400);
		expect(
			(
				await fetch(`${stub.url}/api/v1/charge?price=10000&currency=usd&postage_fee=750&use_hr_post=false`, {
					headers: authenticated,
				})
			).status,
		).toBe(400);
		expect((await fetch(`${stub.url}/api/v1/transactions/tx_91001`, { headers: authenticated })).status).toBe(404);

		const charge = await fetch(`${stub.url}/api/v1/charge?price=10000&currency=eur&postage_fee=750&use_hr_post=false`, {
			headers: authenticated,
		});
		expect(charge.status).toBe(200);

		const transactionUrl = `${stub.url}/api/v1/me/transactions/create_with_guest_user`;
		for (const request of [
			{ headers: authenticated, body: validTrustapTransactionBody },
			{ headers: trustapHeaders('wrong-actor'), body: validTrustapTransactionBody },
			{ headers: trustapHeaders(validTrustapTransactionBody.seller_id), body: validTrustapTransactionBody },
			{
				headers: trustapHeaders(validTrustapTransactionBody.buyer_id),
				body: { ...validTrustapTransactionBody, price: '10000' },
			},
			{
				headers: trustapHeaders(validTrustapTransactionBody.buyer_id),
				body: { ...validTrustapTransactionBody, charge: validTrustapTransactionBody.charge + 1 },
			},
		]) {
			const response = await fetch(transactionUrl, {
				method: 'POST',
				headers: request.headers,
				body: JSON.stringify(request.body),
			});
			expect(response.status).toBe(400);
		}

		expect(
			(
				await fetch(transactionUrl, {
					method: 'POST',
					headers: trustapHeaders(validTrustapTransactionBody.buyer_id),
					body: JSON.stringify(validTrustapTransactionBody),
				})
			).status,
		).toBe(201);

		const sellerCreated = { ...validTrustapTransactionBody, creator_role: 'seller' as const };
		expect(
			(
				await fetch(transactionUrl, {
					method: 'POST',
					headers: trustapHeaders(sellerCreated.buyer_id),
					body: JSON.stringify(sellerCreated),
				})
			).status,
		).toBe(400);
		expect(
			(
				await fetch(transactionUrl, {
					method: 'POST',
					headers: trustapHeaders(sellerCreated.seller_id),
					body: JSON.stringify(sellerCreated),
				})
			).status,
		).toBe(201);
	});

	it('returns only known Trustap transaction resources before applying scenarios', async () => {
		const stub = await startStub('trustap');
		const transactionUrl = `${stub.url}/api/v1/me/transactions/create_with_guest_user`;

		expect((await fetch(`${stub.url}/api/v1/transactions/99999`, { headers: trustapHeaders() })).status).toBe(404);
		expect((await fetch(`${stub.url}/api/v1/transactions/91001`, { headers: trustapHeaders() })).status).toBe(200);

		await fetch(`${stub.url}/api/v1/charge?price=10000&currency=eur&postage_fee=750&use_hr_post=false`, {
			headers: trustapHeaders(),
		});
		const createdResponse = await fetch(transactionUrl, {
			method: 'POST',
			headers: trustapHeaders(validTrustapTransactionBody.buyer_id),
			body: JSON.stringify(validTrustapTransactionBody),
		});
		const created = (await createdResponse.json()) as { id: number };
		expect(createdResponse.status).toBe(201);
		expect(created.id).not.toBe(91_001);
		expect((await fetch(`${stub.url}/api/v1/transactions/${created.id}`, { headers: trustapHeaders() })).status).toBe(
			200,
		);

		await setProviderScenario(stub.url, 'provider-error');
		expect((await fetch(`${stub.url}/api/v1/transactions/99999`, { headers: trustapHeaders() })).status).toBe(404);

		await resetProviderStub(stub.url);
		expect((await fetch(`${stub.url}/api/v1/transactions/${created.id}`, { headers: trustapHeaders() })).status).toBe(
			404,
		);
		expect((await fetch(`${stub.url}/api/v1/transactions/91001`, { headers: trustapHeaders() })).status).toBe(200);
	});

	it('requires exact Shippo token/version headers on every provider route', async () => {
		const stub = await startStub('shippo');
		const cases: Array<{ method: string; path: string; body?: unknown }> = [
			{ method: 'GET', path: '/carrier_accounts' },
			{ method: 'POST', path: '/shipments', body: validShippoShipmentBody },
			{ method: 'GET', path: '/shipments/shipment-test' },
			{ method: 'POST', path: '/transactions', body: { rate: 'rate-test', label_file_type: 'PDF', async: false } },
		];

		for (const authorization of [undefined, 'ShippoToken invalid']) {
			for (const testCase of cases) {
				const response = await fetch(`${stub.url}${testCase.path}`, {
					method: testCase.method,
					headers: {
						'content-type': 'application/json',
						'shippo-api-version': '2018-02-08',
						...(authorization ? { authorization } : {}),
					},
					body: testCase.body === undefined ? undefined : JSON.stringify(testCase.body),
				});
				expect(response.status).toBe(401);
				expect(await response.json()).toEqual({ detail: 'Invalid Shippo API token' });
			}
		}

		for (const version of [undefined, '2024-01-01']) {
			const response = await fetch(`${stub.url}/carrier_accounts`, {
				headers: {
					authorization: `ShippoToken ${requiredTestEnvironment('SHIPPING_PROVIDER_API_KEY')}`,
					...(version ? { 'shippo-api-version': version } : {}),
				},
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ detail: 'Unsupported Shippo API version' });
		}
	});

	it.each([
		{ distanceUnit: 'cm', massUnit: 'g' },
		{ distanceUnit: 'in', massUnit: 'lb' },
	])('accepts Shippo parcels using supported $distanceUnit/$massUnit units', async ({ distanceUnit, massUnit }) => {
		const stub = await startStub('shippo');
		const response = await fetch(`${stub.url}/shipments`, {
			method: 'POST',
			headers: shippoHeaders(),
			body: JSON.stringify({
				...validShippoShipmentBody,
				parcels: [
					{
						...validShippoShipmentBody.parcels[0],
						distance_unit: distanceUnit,
						mass_unit: massUnit,
					},
				],
			}),
		});

		expect(response.status).toBe(201);
	});

	it('validates Shippo shipment fields and purchases only emitted rates with synchronous shape', async () => {
		const stub = await startStub('shippo');
		const headers = shippoHeaders();

		for (const body of [
			{ address_from: 'IT', address_to: { country: 'IT' }, parcels: validShippoShipmentBody.parcels },
			{ address_from: { country: 'IT' }, address_to: { country: 'IT' }, parcels: {} },
			{ address_from: { country: 'IT' }, address_to: { country: 'IT' }, parcels: [{}] },
			{
				...validShippoShipmentBody,
				parcels: [{ ...validShippoShipmentBody.parcels[0], weight: '0' }],
			},
			{
				...validShippoShipmentBody,
				parcels: [{ ...validShippoShipmentBody.parcels[0], distance_unit: 'parsec' }],
			},
			{
				...validShippoShipmentBody,
				parcels: [{ ...validShippoShipmentBody.parcels[0], mass_unit: 'stone' }],
			},
			{
				...validShippoShipmentBody,
				parcels: [{ ...validShippoShipmentBody.parcels[0], height: '-1' }],
			},
			{
				...validShippoShipmentBody,
				parcels: [{ ...validShippoShipmentBody.parcels[0], length: 'not-a-number' }],
			},
			{
				...validShippoShipmentBody,
				parcels: [{ ...validShippoShipmentBody.parcels[0], width: undefined }],
			},
		]) {
			const response = await fetch(`${stub.url}/shipments`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			});
			expect(response.status).toBe(400);
		}

		expect(
			(
				await fetch(`${stub.url}/transactions`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ rate: 'unknown-rate', label_file_type: 'PDF', async: false }),
				})
			).status,
		).toBe(400);
		expect(
			(
				await fetch(`${stub.url}/shipments`, {
					method: 'POST',
					headers,
					body: JSON.stringify(validShippoShipmentBody),
				})
			).status,
		).toBe(201);
		expect(
			(
				await fetch(`${stub.url}/transactions`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ rate: 'rate-test', label_file_type: 'PDF', async: true }),
				})
			).status,
		).toBe(400);
		expect(
			(
				await fetch(`${stub.url}/transactions`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ rate: 'rate-test', label_file_type: 'PDF', async: false }),
				})
			).status,
		).toBe(201);
	});

	it('dispatches route and method before authentication, validation, and scenario injection', async () => {
		const trustap = await startStub('trustap');
		const shippo = await startStub('shippo');
		await setProviderScenario(trustap.url, 'provider-error');
		await setProviderScenario(shippo.url, 'provider-error');

		for (const response of [
			await fetch(`${trustap.url}/api/v1/not-a-route`),
			await fetch(`${trustap.url}/api/v1/guest_users`),
			await fetch(`${shippo.url}/not-a-route`),
			await fetch(`${shippo.url}/carrier_accounts`, { method: 'POST' }),
		]) {
			expect(response.status).toBe(404);
		}

		const invalidTrustap = await fetch(`${trustap.url}/api/v1/guest_users`, {
			method: 'POST',
			headers: trustapHeaders(),
			body: JSON.stringify({ ...validGuestBody, id: '101' }),
		});
		const invalidShippo = await fetch(`${shippo.url}/shipments`, {
			method: 'POST',
			headers: shippoHeaders(),
			body: JSON.stringify({ address_from: 'IT', address_to: {}, parcels: [] }),
		});
		expect(invalidTrustap.status).toBe(400);
		expect(invalidShippo.status).toBe(400);
	});

	it('uses provider-specific error bodies for injected failures', async () => {
		const trustap = await startStub('trustap');
		const shippo = await startStub('shippo');
		await setProviderScenario(trustap.url, 'provider-error');
		await setProviderScenario(shippo.url, 'provider-error');

		const trustapResponse = await fetch(`${trustap.url}/api/v1/guest_users`, {
			method: 'POST',
			headers: trustapHeaders(),
			body: JSON.stringify(validGuestBody),
		});
		const shippoResponse = await fetch(`${shippo.url}/carrier_accounts`, { headers: shippoHeaders() });

		expect(trustapResponse.status).toBe(500);
		expect(await trustapResponse.json()).toEqual({
			error: 'provider_error',
			message: 'Trustap provider error',
		});
		expect(shippoResponse.status).toBe(500);
		expect(await shippoResponse.json()).toEqual({ detail: 'Shippo provider error' });
	});

	it.each<[StubScenario, number]>([
		['unauthorized', 401],
		['invalid-payload', 400],
		['provider-error', 500],
	])('serves the %s scenario with status %i', async (scenario, status) => {
		const stub = await startStub('trustap');
		await setProviderScenario(stub.url, scenario);

		const response = await fetch(`${stub.url}/api/v1/guest_users`, {
			method: 'POST',
			headers: trustapHeaders(),
			body: JSON.stringify(validGuestBody),
		});

		expect(response.status).toBe(status);
		expect(await getProviderRequests(stub.url)).toHaveLength(1);
	});

	it('resets scenarios, request history, Trustap handshakes, and Shippo emitted resources', async () => {
		const trustap = await startStub('trustap');
		const shippo = await startStub('shippo');
		expect(
			(
				await fetch(`${trustap.url}/api/v1/charge?price=10000&currency=eur&postage_fee=750&use_hr_post=false`, {
					headers: trustapHeaders(),
				})
			).status,
		).toBe(200);
		expect(
			(
				await fetch(`${shippo.url}/shipments`, {
					method: 'POST',
					headers: shippoHeaders(),
					body: JSON.stringify(validShippoShipmentBody),
				})
			).status,
		).toBe(201);

		await resetProviderStubs({ trustapUrl: trustap.url, shippoUrl: shippo.url });

		expect(await getProviderRequests(trustap.url)).toEqual([]);
		expect(await getProviderRequests(shippo.url)).toEqual([]);
		expect(
			(
				await fetch(`${trustap.url}/api/v1/me/transactions/create_with_guest_user`, {
					method: 'POST',
					headers: trustapHeaders(validTrustapTransactionBody.seller_id),
					body: JSON.stringify(validTrustapTransactionBody),
				})
			).status,
		).toBe(400);
		expect((await fetch(`${shippo.url}/shipments/shipment-test`, { headers: shippoHeaders() })).status).toBe(404);
		expect(
			(
				await fetch(`${shippo.url}/transactions`, {
					method: 'POST',
					headers: shippoHeaders(),
					body: JSON.stringify({ rate: 'rate-test', label_file_type: 'PDF', async: false }),
				})
			).status,
		).toBe(400);
		await resetProviderStub(trustap.url);
		expect(await getProviderRequests(trustap.url)).toEqual([]);
	});

	it('limits JSON request bodies and never captures rejected payloads', async () => {
		const stub = await startStub('trustap');
		const response = await fetch(`${stub.url}/api/v1/guest_users`, {
			method: 'POST',
			headers: trustapHeaders(),
			body: JSON.stringify({ payload: 'x'.repeat(64 * 1024) }),
		});

		expect(response.status).toBe(413);
		expect(await getProviderRequests(stub.url)).toEqual([]);
	});

	it('refuses provider controls outside a strict worker-local origin', async () => {
		await expect(resetProviderStub('https://127.0.0.1:44001')).rejects.toThrow(/worker-local/i);
		await expect(getProviderRequests('http://localhost:44001')).rejects.toThrow(/worker-local/i);
		await expect(setProviderScenario('http://127.0.0.1', 'success')).rejects.toThrow(/worker-local/i);
	});

	it('closes its loopback listener completely and idempotently', async () => {
		const stub = await startStub('trustap');
		expect(new URL(stub.url).hostname).toBe('127.0.0.1');
		expect((await fetch(`${stub.url}/api/v1/transactions/91001`, { headers: trustapHeaders() })).status).toBe(200);

		await stub.close();
		await stub.close();

		await expect(fetch(`${stub.url}/api/v1/transactions/91001`)).rejects.toThrow();
	});

	it('provides responses accepted by the pinned Shippo 2018-02-08 SDK schemas', () => {
		expect(carrierAccountPaginatedListFromJSON(JSON.stringify(shippoCarrierAccountsFixture)).ok).toBe(true);
		expect(shipmentFromJSON(JSON.stringify(shippoShipmentFixture)).ok).toBe(true);
		expect(transactionFromJSON(JSON.stringify(shippoTransactionFixture)).ok).toBe(true);
	});

	it('omits absent optional Trustap lifecycle datetimes from a created transaction', () => {
		for (const field of ['joined', 'paid', 'tracked', 'delivered', 'funds_released']) {
			expect(trustapTransactionFixture).not.toHaveProperty(field);
		}
	});
});
