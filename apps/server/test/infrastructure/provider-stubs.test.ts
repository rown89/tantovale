import { afterEach, describe, expect, it } from 'vitest';
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

const startedStubs: StartedProviderStub[] = [];

async function startStub(kind: 'trustap' | 'shippo'): Promise<StartedProviderStub> {
	const stub = await startProviderStub(kind);
	startedStubs.push(stub);
	return stub;
}

async function assertTrustapContract(stub: StartedProviderStub): Promise<void> {
	const authorization = `Basic ${Buffer.from('trustap-test-key:').toString('base64')}`;
	const headers = { authorization, 'content-type': 'application/json' };
	const guestBody = {
		id: 101,
		email: 'buyer@tantovale.test',
		first_name: 'Buyer',
		last_name: 'Test',
		country_code: 'IT',
		tos_acceptance: { unix_timestamp: 1_700_000_000, ip: '127.0.0.1' },
	};
	const transactionBody = {
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
			headers,
			body: JSON.stringify(transactionBody),
		}),
		await fetch(`${stub.url}/api/v1/transactions/91001`, { headers: { authorization } }),
	];

	expect(responses.map((response) => response.status)).toEqual([201, 200, 201, 200]);
	expect(await Promise.all(responses.map((response) => response.json()))).toEqual([
		trustapGuestUserFixture,
		trustapChargeFixture,
		trustapTransactionFixture,
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
	const headers = { 'content-type': 'application/json', 'shippo-api-version': '2018-02-08' };
	const shipmentBody = { address_from: { country: 'IT' }, address_to: { country: 'IT' }, parcels: [] };
	const transactionBody = { rate: 'rate-test', label_file_type: 'PDF', async: false };

	const responses = [
		await fetch(`${stub.url}/carrier_accounts`, { headers: { 'shippo-api-version': '2018-02-08' } }),
		await fetch(`${stub.url}/shipments`, {
			method: 'POST',
			headers,
			body: JSON.stringify(shipmentBody),
		}),
		await fetch(`${stub.url}/shipments/shipment-test`, {
			headers: { 'shippo-api-version': '2018-02-08' },
		}),
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
}

afterEach(async () => {
	await Promise.allSettled(startedStubs.splice(0).map((stub) => stub.close()));
});

describe('local commerce provider stubs', () => {
	it('starts one isolated pair and exercises all Trustap v1 and Shippo 2018-02-08 success endpoints', async () => {
		const [trustap, shippo] = await Promise.all([startStub('trustap'), startStub('shippo')]);

		await assertTrustapContract(trustap);
		await assertShippoContract(shippo);
	});

	it.each<[StubScenario, number]>([
		['unauthorized', 401],
		['invalid-payload', 422],
		['provider-error', 500],
	])('serves the %s scenario with status %i', async (scenario, status) => {
		const stub = await startStub('trustap');
		await setProviderScenario(stub.url, scenario);

		const response = await fetch(`${stub.url}/api/v1/guest_users`, { method: 'POST' });

		expect(response.status).toBe(status);
		expect(await getProviderRequests(stub.url)).toHaveLength(1);
	});

	it('resets both stubs to success and clears only provider request history', async () => {
		const trustap = await startStub('trustap');
		const shippo = await startStub('shippo');
		await setProviderScenario(trustap.url, 'provider-error');
		await setProviderScenario(shippo.url, 'provider-error');
		await fetch(`${trustap.url}/api/v1/transactions/91001`);
		await fetch(`${shippo.url}/shipments/shipment-test`);

		await resetProviderStubs({ trustapUrl: trustap.url, shippoUrl: shippo.url });

		expect(await getProviderRequests(trustap.url)).toEqual([]);
		expect(await getProviderRequests(shippo.url)).toEqual([]);
		expect((await fetch(`${trustap.url}/api/v1/transactions/91001`)).status).toBe(200);
		expect((await fetch(`${shippo.url}/shipments/shipment-test`)).status).toBe(200);
		await resetProviderStub(trustap.url);
		expect(await getProviderRequests(trustap.url)).toEqual([]);
	});

	it('limits JSON request bodies and never captures rejected payloads', async () => {
		const stub = await startStub('trustap');
		const response = await fetch(`${stub.url}/api/v1/guest_users`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
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
		expect((await fetch(`${stub.url}/api/v1/transactions/91001`)).status).toBe(200);

		await stub.close();
		await stub.close();

		await expect(fetch(`${stub.url}/api/v1/transactions/91001`)).rejects.toThrow();
	});

	it('provides responses accepted by the pinned Shippo 2018-02-08 SDK schemas', () => {
		expect(carrierAccountPaginatedListFromJSON(JSON.stringify(shippoCarrierAccountsFixture)).ok).toBe(true);
		expect(shipmentFromJSON(JSON.stringify(shippoShipmentFixture)).ok).toBe(true);
		expect(transactionFromJSON(JSON.stringify(shippoTransactionFixture)).ok).toBe(true);
	});
});
