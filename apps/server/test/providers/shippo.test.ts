import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import {
	addresses,
	entityTrustapTransactions,
	items,
	orders,
	shipping_label_purchases,
	shipping_quotes,
} from '../../src/database/schemas/schema';
import { entityTrustapTransactionTypeValues, ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import { ShipmentService, ShippoProviderError } from '../../src/routes/shipment-provider/shipment.service';
import { environment, SHIPPING_UNITS } from '../../src/utils/constants';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	type CommerceActorGraph,
} from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { assertShipmentDateWithinWindow } from '../helpers/provider-contract';
import { getProviderRequests, setProviderScenario } from '../helpers/providers';
import { CookieJar, jsonRequest } from '../helpers/request';
import type { StubScenario } from '../infrastructure/provider-stubs';

type ShippingQuoteResponse = {
	rates: Array<{
		amount: string;
		currency: string;
		shipment_label_id: string;
		shipping_quote_id: string;
	}>;
};

function shippoUrl(): string {
	const url = environment.SHIPPING_PROVIDER_API_URL;
	if (!url) throw new Error('Missing worker-local Shippo stub URL');
	return url;
}

async function createShippingQuote(itemId: number, jar: CookieJar) {
	const response = await authenticatedRequest('/shipment_provider/auth/calculate_shipment_cost', 'POST', jar, {
		item_id: itemId,
	});
	expect(response.status).toBe(200);
	const body = (await response.json()) as ShippingQuoteResponse;
	return body.rates[0]!;
}

async function prepareLabelOrder(
	status: (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES] = ORDER_PHASES.PAYMENT_CONFIRMED,
) {
	const actors = await createCommerceActors();
	const item = await createItemFixture(actors);
	const quote = await createShippingQuote(item.id, actors.buyer.jar);
	const { db } = getTestDatabase();
	await db
		.update(shipping_quotes)
		.set({ consumed_at: new Date() })
		.where(eq(shipping_quotes.id, quote.shipping_quote_id));
	const order = await createOrderFixture(actors, item, {
		shipping_label_id: quote.shipment_label_id,
		shipping_quote_id: quote.shipping_quote_id,
		shipping_price: 750,
		status,
	});
	return { actors, item, quote, order };
}

async function prepareProviderBackedLabelOrder() {
	const prepared = await prepareLabelOrder(ORDER_PHASES.PAYMENT_CONFIRMED);
	if (!prepared.order.payment_transaction_id) throw new Error('Label order fixture has no payment transaction');
	const { db } = getTestDatabase();
	await db.insert(entityTrustapTransactions).values({
		entityId: prepared.item.id,
		sellerId: prepared.actors.seller.profile.payment_provider_id,
		buyerId: prepared.actors.buyer.profile.payment_provider_id,
		transactionId: prepared.order.payment_transaction_id,
		status: entityTrustapTransactionTypeValues.PAID,
		price: prepared.order.item_price + prepared.order.platform_charge,
		charge: prepared.order.payment_provider_charge,
		chargeSeller: 0,
		entityTitle: prepared.item.title,
	});
	return prepared;
}

function exactShipmentBody(
	actors: CommerceActorGraph,
	item: Awaited<ReturnType<typeof createItemFixture>>,
	quoteId: string,
) {
	return {
		metadata: `tvq1:${quoteId}`,
		shipment_date: '<current-iso>',
		address_from: {
			name: `${actors.seller.profile.name} ${actors.seller.profile.surname}`,
			street1: `${actors.seller.address.street_address} ${actors.seller.address.civic_number}`,
			street_no: actors.seller.address.civic_number,
			city: actors.catalog.actorLocations.seller.city.name,
			state: actors.catalog.actorLocations.seller.province.state_code,
			zip: String(actors.seller.address.postal_code),
			country: actors.seller.address.country_code,
			phone: actors.seller.address.phone,
			email: actors.seller.user.email,
			is_residential: true,
			validate: false,
		},
		address_to: {
			name: `${actors.buyer.profile.name} ${actors.buyer.profile.surname}`,
			street1: `${actors.buyer.address.street_address} ${actors.buyer.address.civic_number}`,
			street_no: actors.buyer.address.civic_number,
			city: actors.catalog.actorLocations.buyer.city.name,
			state: actors.catalog.actorLocations.buyer.province.state_code,
			zip: String(actors.buyer.address.postal_code),
			country: actors.buyer.address.country_code,
			phone: actors.buyer.address.phone,
			email: actors.buyer.user.email,
			is_residential: true,
			validate: false,
		},
		async: false,
		parcels: [
			{
				mass_unit: SHIPPING_UNITS.MASS,
				weight: String(item.item_weight),
				distance_unit: SHIPPING_UNITS.DISTANCE,
				height: String(item.item_height),
				length: String(item.item_length),
				width: String(item.item_width),
			},
		],
	};
}

async function expectNoNewProviderRequests(beforeCount: number): Promise<void> {
	expect(await getProviderRequests(shippoUrl())).toHaveLength(beforeCount);
}

async function labelBarrierReached(): Promise<number> {
	const response = await fetch(`${shippoUrl()}/__test/label-barrier`, { signal: AbortSignal.timeout(2_000) });
	if (!response.ok) throw new Error(`Shippo label barrier status failed with ${response.status}`);
	return ((await response.json()) as { reached: number }).reached;
}

async function waitForLabelBarrier(expected: number, signal?: AbortSignal): Promise<boolean> {
	const deadline = Date.now() + 3_000;
	while (!signal?.aborted && Date.now() < deadline) {
		if ((await labelBarrierReached()) >= expected) return true;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	return false;
}

async function releaseLabelBarrier(): Promise<void> {
	const response = await fetch(`${shippoUrl()}/__test/label-barrier/release`, {
		method: 'POST',
		signal: AbortSignal.timeout(2_000),
	});
	if (!response.ok) throw new Error(`Shippo label barrier release failed with ${response.status}`);
}

async function rateBarrierReached(): Promise<number> {
	const response = await fetch(`${shippoUrl()}/__test/rate-barrier`, { signal: AbortSignal.timeout(2_000) });
	if (!response.ok) throw new Error(`Shippo rate barrier status failed with ${response.status}`);
	return ((await response.json()) as { reached: number }).reached;
}

async function waitForRateBarrier(expected: number): Promise<boolean> {
	const deadline = Date.now() + 3_000;
	while (Date.now() < deadline) {
		if ((await rateBarrierReached()) >= expected) return true;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	return false;
}

async function releaseRateBarrier(): Promise<void> {
	const response = await fetch(`${shippoUrl()}/__test/rate-barrier/release`, {
		method: 'POST',
		signal: AbortSignal.timeout(2_000),
	});
	if (!response.ok) throw new Error(`Shippo rate barrier release failed with ${response.status}`);
}

async function postTrustapStatus(transactionId: string, status: string): Promise<Response> {
	return app.request('/webhooks/trustap/transaction-update', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
		},
		body: JSON.stringify({ event: 'transaction_status_updated', transaction_id: transactionId, status }),
	});
}

describe('Shippo 2018-02-08 mounted boundary', () => {
	it('documents the exact active-carrier key and optional tracking fields', async () => {
		const response = await app.request('/openapi');
		expect(response.status).toBe(200);
		const document = (await response.json()) as {
			paths: Record<
				string,
				Record<
					string,
					{
						responses: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
					}
				>
			>;
		};
		const carrierSchema = document.paths['/shipment_provider/auth/active_carriers']?.get?.responses['200']?.content?.[
			'application/json'
		]?.schema as { properties?: Record<string, unknown>; required?: string[] };
		expect(carrierSchema.required).toEqual(['activeCarriers']);
		expect(Object.keys(carrierSchema.properties ?? {})).toEqual(['activeCarriers']);

		const labelSchema = document.paths['/shipment_provider/auth/create_label']?.post?.responses['201']?.content?.[
			'application/json'
		]?.schema as {
			properties?: { label?: { required?: string[] } };
		};
		expect(labelSchema.properties?.label?.required).toEqual(['id', 'status', 'label_url']);
	});

	it('filters inactive carrier accounts and pins the Shippo version and token headers', async () => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest('/shipment_provider/auth/active_carriers', 'GET', actors.seller.jar);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { activeCarriers: Array<Record<string, unknown>> };
		expect(body.activeCarriers).toHaveLength(1);
		expect(body.activeCarriers[0]).toEqual({
			accountId: 'account-test',
			active: true,
			carrier: 'poste_italiane',
		});

		const requests = await getProviderRequests(shippoUrl());
		expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
			{ method: 'GET', path: '/carrier_accounts?page=1&results=25' },
		]);
		expect(requests[0]?.headers['shippo-api-version']).toBe('2018-02-08');
		expect(requests[0]?.headers.authorization).toBe(`ShippoToken ${environment.SHIPPING_PROVIDER_API_KEY}`);
	});

	it('returns the intended 404 for an empty carrier list', async () => {
		const actors = await createCommerceActors();
		await setProviderScenario(shippoUrl(), 'shippo-carriers-empty');
		const response = await authenticatedRequest('/shipment_provider/auth/active_carriers', 'GET', actors.seller.jar);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ message: 'No active carriers found' });
	});

	it('builds the exact synchronous shipment from distinct seller and buyer database addresses', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const startedAt = Date.now();
		const quote = await createShippingQuote(item.id, actors.buyer.jar);
		const endedAt = Date.now();
		expect(quote).toEqual({
			amount: '7.50',
			currency: 'EUR',
			shipment_label_id: 'shipment-test',
			shipping_quote_id: quote.shipping_quote_id,
		});
		expect(quote.shipment_label_id).not.toBe('rate-test');

		const requests = await getProviderRequests(shippoUrl());
		expect(requests).toHaveLength(1);
		const request = requests[0]!;
		expect({ method: request.method, path: request.path }).toEqual({ method: 'POST', path: '/shipments' });
		expect(request.headers.authorization).toBe(`ShippoToken ${environment.SHIPPING_PROVIDER_API_KEY}`);
		expect(request.headers['content-type']).toBe('application/json');
		expect(request.headers['shippo-api-version']).toBe('2018-02-08');
		if (typeof request.body !== 'object' || request.body === null || !('shipment_date' in request.body)) {
			throw new Error('Captured Shippo shipment body has no shipment_date');
		}
		assertShipmentDateWithinWindow(request.body.shipment_date, {
			operation: 'shipping boundary quote',
			startedAt,
			endedAt,
		});
		expect({ ...request.body, shipment_date: '<current-iso>' }).toEqual(
			exactShipmentBody(actors, item, quote.shipping_quote_id),
		);
		const shipmentBody = request.body as unknown as {
			address_from: { city: string; state: string };
			address_to: { city: string; state: string };
		};
		expect(shipmentBody.address_from.city).not.toBe(shipmentBody.address_from.state);
		expect(shipmentBody.address_to.city).not.toBe(shipmentBody.address_to.state);
	});

	it('lets only the order seller purchase a verified rate and keeps the parent shipment alias unchanged', async () => {
		const { actors, quote, order } = await prepareLabelOrder();

		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			label: {
				id: 'label-transaction-test',
				status: 'SUCCESS',
				label_url: 'https://labels.test/label-transaction-test.pdf',
				tracking_number: 'TRACK-TEST-1',
				tracking_url: 'https://tracking.test/TRACK-TEST-1',
			},
		});

		const requests = await getProviderRequests(shippoUrl());
		expect(requests.slice(1).map(({ method, path, body }) => ({ method, path, body }))).toEqual([
			{ method: 'GET', path: '/rates/rate-test', body: undefined },
			{ method: 'POST', path: '/transactions', body: { rate: 'rate-test', async: false, label_file_type: 'PDF' } },
		]);
		expect(requests.slice(1).map(({ headers }) => headers['shippo-api-version'])).toEqual(['2018-02-08', '2018-02-08']);
		expect(requests.slice(1).map(({ headers }) => headers.authorization)).toEqual([
			`ShippoToken ${environment.SHIPPING_PROVIDER_API_KEY}`,
			`ShippoToken ${environment.SHIPPING_PROVIDER_API_KEY}`,
		]);
		expect(requests[2]?.headers['content-type']).toBe('application/json');

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder?.shipping_label_id).toBe(quote.shipment_label_id);
		expect(await db.select().from(shipping_quotes).where(eq(shipping_quotes.id, quote.shipping_quote_id))).toHaveLength(
			1,
		);
	});

	it('returns the persisted label on retry without another provider call', async () => {
		const { actors, order } = await prepareLabelOrder();
		const first = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(first.status).toBe(201);
		const firstBody = await first.json();
		const afterFirst = await getProviderRequests(shippoUrl());

		const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(retry.status).toBe(201);
		expect(await retry.json()).toEqual(firstBody);
		expect(await getProviderRequests(shippoUrl())).toEqual(afterFirst);

		const { db } = getTestDatabase();
		const [purchase] = await db
			.select()
			.from(shipping_label_purchases)
			.where(eq(shipping_label_purchases.order_id, order.id));
		expect(purchase).toEqual({
			id: expect.any(Number),
			order_id: order.id,
			item_id: order.item_id,
			purchase_attempt_id: expect.stringMatching(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			),
			shippo_rate_id: 'rate-test',
			state: 'purchased',
			provider_transaction_id: 'label-transaction-test',
			provider_status: 'SUCCESS',
			label_url: 'https://labels.test/label-transaction-test.pdf',
			tracking_number: 'TRACK-TEST-1',
			tracking_url: 'https://tracking.test/TRACK-TEST-1',
			created_at: expect.any(Date),
			updated_at: expect.any(Date),
		});
	});

	it('rejects a caller rate different from the consumed quote before provider I/O', async () => {
		const { actors, order } = await prepareLabelOrder();
		const before = await getProviderRequests(shippoUrl());
		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-other',
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ message: 'Shipping rate does not match the consumed quote' });
		expect(await getProviderRequests(shippoUrl())).toEqual(before);
	});

	it('rejects an order without its consumed shipping quote before provider I/O', async () => {
		const { actors, order } = await prepareLabelOrder();
		const { db } = getTestDatabase();
		await db.update(orders).set({ shipping_quote_id: null }).where(eq(orders.id, order.id));
		const before = await getProviderRequests(shippoUrl());
		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ message: 'Order has no consumed shipping quote' });
		expect(await getProviderRequests(shippoUrl())).toEqual(before);
	});

	it.each([
		{ field: 'shipping_price', value: 751 },
		{ field: 'shipping_label_id', value: 'shipment-tampered' },
	] as const)('rejects local order/quote $field divergence before provider I/O', async ({ field, value }) => {
		const { actors, order } = await prepareLabelOrder();
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({ [field]: value })
			.where(eq(orders.id, order.id));
		const before = await getProviderRequests(shippoUrl());
		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ message: 'Order shipping quote is inconsistent' });
		expect(await getProviderRequests(shippoUrl())).toEqual(before);
	});

	it('rejects a quote that is no longer marked consumed', async () => {
		const { actors, order, quote } = await prepareLabelOrder();
		const { db } = getTestDatabase();
		await db.update(shipping_quotes).set({ consumed_at: null }).where(eq(shipping_quotes.id, quote.shipping_quote_id));
		const before = await getProviderRequests(shippoUrl());
		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(response.status).toBe(409);
		expect(await getProviderRequests(shippoUrl())).toEqual(before);
	});

	it('serializes concurrent label purchase so exactly one request reaches Shippo', async () => {
		const { actors, order } = await prepareLabelOrder();
		await setProviderScenario(shippoUrl(), 'shippo-label-barrier');
		const first = authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(await waitForLabelBarrier(1)).toBe(true);
		const second = authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		const duplicateAbort = new AbortController();
		const outcome = await Promise.race([
			second.then((response) => ({ kind: 'response' as const, response })),
			waitForLabelBarrier(2, duplicateAbort.signal).then((duplicateReached) => ({
				kind: 'duplicate' as const,
				duplicateReached,
			})),
		]);
		duplicateAbort.abort();
		try {
			expect(outcome.kind).toBe('response');
			if (outcome.kind !== 'response') throw new Error('A duplicate label request reached Shippo');
			expect(outcome.response.status).toBe(409);
		} finally {
			await releaseLabelBarrier();
		}
		const firstResponse = await first;
		expect(firstResponse.status).toBe(201);
		expect((await getProviderRequests(shippoUrl())).filter(({ path }) => path === '/transactions')).toHaveLength(1);
		expect(await getTestDatabase().db.select().from(shipping_label_purchases)).toHaveLength(1);
	});

	it('rechecks order eligibility after rate retrieval and never posts for a terminal order', async () => {
		const { actors, order } = await prepareLabelOrder();
		await setProviderScenario(shippoUrl(), 'shippo-rate-barrier');
		const purchase = authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(await waitForRateBarrier(1)).toBe(true);
		await getTestDatabase()
			.db.update(orders)
			.set({ status: ORDER_PHASES.PAYMENT_REFUNDED })
			.where(eq(orders.id, order.id));
		await releaseRateBarrier();

		const response = await purchase;
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ message: 'Shipping label purchase requires reconciliation' });
		expect((await getProviderRequests(shippoUrl())).filter(({ path }) => path === '/transactions')).toEqual([]);
		const [intent] = await getTestDatabase()
			.db.select()
			.from(shipping_label_purchases)
			.where(eq(shipping_label_purchases.order_id, order.id));
		expect(intent?.state).toBe('reconciliation_required');
	});

	it('defers a terminal webhook during Shippo POST until the purchased intent is durable', async () => {
		const { actors, order } = await prepareProviderBackedLabelOrder();
		await setProviderScenario(shippoUrl(), 'shippo-label-barrier');
		const purchase = authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(await waitForLabelBarrier(1)).toBe(true);
		const deferred = await postTrustapStatus(
			order.payment_transaction_id!,
			entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		);
		expect(deferred.status).toBe(503);
		expect(await deferred.json()).toEqual({ error: 'Shipping label purchase transition deferred' });
		const { db } = getTestDatabase();
		const [duringOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [duringProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, order.payment_transaction_id!));
		expect(duringOrder?.status).toBe(ORDER_PHASES.PAYMENT_CONFIRMED);
		expect(duringProvider?.status).toBe(entityTrustapTransactionTypeValues.PAID);

		await releaseLabelBarrier();
		expect((await purchase).status).toBe(201);
		const [purchasedIntent] = await db
			.select()
			.from(shipping_label_purchases)
			.where(eq(shipping_label_purchases.order_id, order.id));
		expect(purchasedIntent?.state).toBe('purchased');

		const retried = await postTrustapStatus(
			order.payment_transaction_id!,
			entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		);
		expect(retried.status).toBe(200);
		const [terminalOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(terminalOrder?.status).toBe(ORDER_PHASES.PAYMENT_REFUNDED);
	});

	it('blocks every retry after Shippo creates a label but the response is lost', async () => {
		const { actors, order } = await prepareLabelOrder();
		await setProviderScenario(shippoUrl(), 'shippo-label-disconnect-after-create');
		const first = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(first.status).toBe(502);
		const afterFirst = await getProviderRequests(shippoUrl());
		expect(afterFirst.filter(({ path }) => path === '/transactions')).toHaveLength(1);
		const [purchase] = await getTestDatabase()
			.db.select()
			.from(shipping_label_purchases)
			.where(eq(shipping_label_purchases.order_id, order.id));
		expect(purchase?.state).toBe('reconciliation_required');

		await setProviderScenario(shippoUrl(), 'success');
		const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(retry.status).toBe(409);
		expect(await getProviderRequests(shippoUrl())).toEqual(afterFirst);
	});

	it('keeps terminal provider transitions retriable while an ambiguous label intent awaits reconciliation', async () => {
		const { actors, order } = await prepareProviderBackedLabelOrder();
		await setProviderScenario(shippoUrl(), 'shippo-label-disconnect-after-create');
		const purchase = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(purchase.status).toBe(502);

		const deferred = await postTrustapStatus(
			order.payment_transaction_id!,
			entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		);
		expect(deferred.status).toBe(503);
		expect(await deferred.json()).toEqual({ error: 'Shipping label purchase transition deferred' });
		const { db } = getTestDatabase();
		const [intent] = await db
			.select()
			.from(shipping_label_purchases)
			.where(eq(shipping_label_purchases.order_id, order.id));
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, order.payment_transaction_id!));
		expect(intent?.state).toBe('reconciliation_required');
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_CONFIRMED);
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.PAID);
	});

	it.each(['shippo-label-client-error', 'shippo-label-unprocessable'] as const)(
		'releases a label claim after definite Shippo rejection %s and permits one retry',
		async (scenario) => {
			const { actors, order } = await prepareLabelOrder();
			await setProviderScenario(shippoUrl(), scenario);
			const first = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(first.status).toBe(502);
			expect(
				await getTestDatabase()
					.db.select()
					.from(shipping_label_purchases)
					.where(eq(shipping_label_purchases.order_id, order.id)),
			).toEqual([]);

			await setProviderScenario(shippoUrl(), 'success');
			const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(retry.status).toBe(201);
			expect((await getProviderRequests(shippoUrl())).filter(({ path }) => path === '/transactions')).toHaveLength(2);
		},
	);

	it.each([
		'shippo-label-provider-error',
		'shippo-label-malformed-json',
		'shippo-label-invalid-body',
		'shippo-label-delay',
		'shippo-label-disconnect',
		'shippo-label-status-error',
		'shippo-label-rate-mismatch',
	] as const)('blocks retries after ambiguous Shippo label outcome %s', async (scenario) => {
		const { actors, order } = await prepareLabelOrder();
		await setProviderScenario(shippoUrl(), scenario);
		const first = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(first.status).toBe(502);
		const afterFirst = await getProviderRequests(shippoUrl());
		const [purchase] = await getTestDatabase()
			.db.select()
			.from(shipping_label_purchases)
			.where(eq(shipping_label_purchases.order_id, order.id));
		expect(purchase?.state).toBe('reconciliation_required');

		await setProviderScenario(shippoUrl(), 'success');
		const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(retry.status).toBe(409);
		expect(await getProviderRequests(shippoUrl())).toEqual(afterFirst);
	});

	it('compensates a local finalization failure with complete known provider evidence', async () => {
		const { actors, order } = await prepareLabelOrder();
		const { client, db } = getTestDatabase();
		await client.query(`
			CREATE FUNCTION test_reject_label_purchase_finalize() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN
				IF NEW.state = 'purchased' THEN RAISE EXCEPTION 'test finalization failure'; END IF;
				RETURN NEW;
			END $$;
			CREATE TRIGGER test_reject_label_purchase_finalize
				BEFORE UPDATE ON shipping_label_purchases
				FOR EACH ROW EXECUTE FUNCTION test_reject_label_purchase_finalize();
		`);
		try {
			const first = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(first.status).toBe(502);
			const afterFirst = await getProviderRequests(shippoUrl());
			expect(afterFirst.filter(({ path }) => path === '/transactions')).toHaveLength(1);
			const [purchase] = await db
				.select()
				.from(shipping_label_purchases)
				.where(eq(shipping_label_purchases.order_id, order.id));
			expect(purchase).toMatchObject({
				state: 'reconciliation_required',
				provider_transaction_id: 'label-transaction-test',
				provider_status: 'SUCCESS',
				label_url: 'https://labels.test/label-transaction-test.pdf',
				tracking_number: 'TRACK-TEST-1',
				tracking_url: 'https://tracking.test/TRACK-TEST-1',
			});

			const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(retry.status).toBe(409);
			expect(await getProviderRequests(shippoUrl())).toEqual(afterFirst);
		} finally {
			await client.query('DROP TRIGGER IF EXISTS test_reject_label_purchase_finalize ON shipping_label_purchases');
			await client.query('DROP FUNCTION IF EXISTS test_reject_label_purchase_finalize()');
		}
	});

	it('keeps the original durable claim blocking when both finalize and compensation fail', async () => {
		const { actors, order } = await prepareLabelOrder();
		const { client, db } = getTestDatabase();
		await client.query(`
			CREATE FUNCTION test_reject_all_label_purchase_updates() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN
				RAISE EXCEPTION 'test all label persistence failure';
			END $$;
			CREATE TRIGGER test_reject_all_label_purchase_updates
				BEFORE UPDATE ON shipping_label_purchases
				FOR EACH ROW EXECUTE FUNCTION test_reject_all_label_purchase_updates();
		`);
		try {
			const first = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(first.status).toBe(502);
			const afterFirst = await getProviderRequests(shippoUrl());
			expect(afterFirst.filter(({ path }) => path === '/transactions')).toHaveLength(1);
			const [purchase] = await db
				.select()
				.from(shipping_label_purchases)
				.where(eq(shipping_label_purchases.order_id, order.id));
			expect(purchase).toMatchObject({
				state: 'creating',
				provider_transaction_id: null,
				provider_status: null,
				label_url: null,
			});

			const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(retry.status).toBe(409);
			expect(await getProviderRequests(shippoUrl())).toEqual(afterFirst);
		} finally {
			await client.query('DROP TRIGGER IF EXISTS test_reject_all_label_purchase_updates ON shipping_label_purchases');
			await client.query('DROP FUNCTION IF EXISTS test_reject_all_label_purchase_updates()');
		}
	});

	it('persists a successful label when official tracking fields are absent and retries idempotently', async () => {
		const { actors, order } = await prepareLabelOrder();
		await setProviderScenario(shippoUrl(), 'shippo-label-without-tracking');
		const first = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(first.status).toBe(201);
		const body = await first.json();
		expect(body).toEqual({
			label: {
				id: 'label-transaction-test',
				status: 'SUCCESS',
				label_url: 'https://labels.test/label-transaction-test.pdf',
			},
		});
		const requests = await getProviderRequests(shippoUrl());
		const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(retry.status).toBe(201);
		expect(await retry.json()).toEqual(body);
		expect(await getProviderRequests(shippoUrl())).toEqual(requests);
		const [purchase] = await getTestDatabase()
			.db.select({
				state: shipping_label_purchases.state,
				tracking_number: shipping_label_purchases.tracking_number,
				tracking_url: shipping_label_purchases.tracking_url,
			})
			.from(shipping_label_purchases)
			.where(eq(shipping_label_purchases.order_id, order.id));
		expect(purchase).toEqual({ tracking_number: null, tracking_url: null, state: 'purchased' });
	});

	it.each([ORDER_PHASES.PAYMENT_CONFIRMED, ORDER_PHASES.SHIPPING_PENDING])(
		'allows a seller label purchase from the %s phase',
		async (status) => {
			const { actors, order } = await prepareLabelOrder(status);
			const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(response.status).toBe(201);
		},
	);

	it('rejects unknown orders and non-sellers without disclosing ownership or contacting Shippo', async () => {
		const { actors, order } = await prepareLabelOrder();
		const beforeCount = (await getProviderRequests(shippoUrl())).length;
		for (const [jar, orderId] of [
			[actors.buyer.jar, order.id],
			[actors.outsider.jar, order.id],
			[actors.seller.jar, 2_147_483_647],
		] as const) {
			const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', jar, {
				order_id: orderId,
				rate_id: 'rate-test',
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ message: 'Order not found' });
		}
		await expectNoNewProviderRequests(beforeCount);
	});

	it.each([
		ORDER_PHASES.PAYMENT_PENDING,
		ORDER_PHASES.PAYMENT_FAILED,
		ORDER_PHASES.PAYMENT_REFUNDED,
		ORDER_PHASES.SHIPPING_CONFIRMED,
		ORDER_PHASES.COMPLETED,
		ORDER_PHASES.CANCELLED,
		ORDER_PHASES.EXPIRED,
	])('rejects label purchase from the %s phase before provider I/O', async (status) => {
		const { actors, order } = await prepareLabelOrder();
		const { db } = getTestDatabase();
		await db.update(orders).set({ status }).where(eq(orders.id, order.id));
		const beforeCount = (await getProviderRequests(shippoUrl())).length;
		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ message: 'Order is not ready for label purchase' });
		await expectNoNewProviderRequests(beforeCount);
	});

	it.each([
		{ scenario: 'shippo-rate-amount-mismatch', category: 'amount' },
		{ scenario: 'shippo-rate-currency-mismatch', category: 'currency' },
	] satisfies Array<{ scenario: StubScenario; category: string }>)(
		'rejects a provider rate $category mismatch without purchasing a label',
		async ({ scenario }) => {
			const { actors, order } = await prepareLabelOrder();
			await setProviderScenario(shippoUrl(), scenario);
			const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(response.status).toBe(502);
			expect((await getProviderRequests(shippoUrl())).filter(({ path }) => path === '/transactions')).toEqual([]);
			await setProviderScenario(shippoUrl(), 'success');
			const retry = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(retry.status).toBe(201);
		},
	);

	it('classifies a provider-returned rate id mismatch as an invalid upstream response', async () => {
		const { actors, order } = await prepareLabelOrder();
		await setProviderScenario(shippoUrl(), 'shippo-rate-id-mismatch');
		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ message: 'Shipping provider request failed' });
	});

	it('rejects an unknown rate and a rate from another shipment before purchasing a transaction', async () => {
		const { actors, item, order } = await prepareLabelOrder();
		const unknown = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-unknown',
		});
		expect(unknown.status).toBe(400);
		expect(await unknown.json()).toEqual({ message: 'Shipping rate does not match the consumed quote' });

		const otherQuote = await createShippingQuote(item.id, actors.buyer.jar);
		expect(otherQuote.shipment_label_id).not.toBe(order.shipping_label_id);
		const mismatch = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test-2',
		});
		expect(mismatch.status).toBe(400);
		expect(await mismatch.json()).toEqual({ message: 'Shipping rate does not match the consumed quote' });
		const transactionRequests = (await getProviderRequests(shippoUrl())).filter(({ path }) => path === '/transactions');
		expect(transactionRequests).toEqual([]);
	});

	it.each([
		{ scenario: 'shippo-rate-id-mismatch', message: 'Shipping provider request failed' },
		{ scenario: 'shippo-label-rate-mismatch', message: 'Shipping provider request failed' },
	] satisfies Array<{ scenario: StubScenario; message: string }>)(
		'rejects provider correlation mismatch $scenario without exposing a false label',
		async ({ scenario, message }) => {
			const { actors, order, quote } = await prepareLabelOrder();
			await setProviderScenario(shippoUrl(), scenario);
			const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
				order_id: order.id,
				rate_id: 'rate-test',
			});
			expect(response.status).toBe(502);
			expect(await response.json()).toEqual({ message });
			const { db } = getTestDatabase();
			const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(storedOrder?.shipping_label_id).toBe(quote.shipment_label_id);
		},
	);

	it.each([
		'unauthorized',
		'invalid-payload',
		'unprocessable',
		'provider-error',
		'shippo-carriers-malformed-json',
		'shippo-carriers-invalid-body',
		'shippo-carriers-delay',
		'shippo-carriers-disconnect',
	] satisfies StubScenario[])('returns a controlled carrier error for %s', async (scenario) => {
		const actors = await createCommerceActors();
		await setProviderScenario(shippoUrl(), scenario);
		const response = await authenticatedRequest('/shipment_provider/auth/active_carriers', 'GET', actors.seller.jar);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ message: 'Failed to fetch active carriers' });
	});

	it.each([
		{ scenario: 'unauthorized', category: 'http', status: 401 },
		{ scenario: 'invalid-payload', category: 'http', status: 400 },
		{ scenario: 'unprocessable', category: 'http', status: 422 },
		{ scenario: 'provider-error', category: 'http', status: 500 },
		{ scenario: 'shippo-carriers-malformed-json', category: 'invalid_response', status: undefined },
		{ scenario: 'shippo-carriers-invalid-body', category: 'invalid_response', status: undefined },
		{ scenario: 'shippo-carriers-delay', category: 'network', status: undefined },
		{ scenario: 'shippo-carriers-disconnect', category: 'network', status: undefined },
	] satisfies Array<{
		scenario: StubScenario;
		category: 'http' | 'invalid_response' | 'network';
		status: number | undefined;
	}>)('classifies $scenario as a typed redacted $category boundary error', async ({ scenario, category, status }) => {
		await setProviderScenario(shippoUrl(), scenario);
		const error = await new ShipmentService().listActiveCarriers().catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ShippoProviderError);
		expect(error).toMatchObject({
			name: 'ShippoProviderError',
			provider: 'shippo',
			operation: 'list_carriers',
			category,
			...(status === undefined ? {} : { status }),
			message: 'Shipping provider request failed',
		});
		const serialized = JSON.stringify(error);
		expect(serialized).not.toContain(environment.SHIPPING_PROVIDER_API_KEY);
		expect(serialized).not.toContain('Invalid Shippo API token');
		expect(serialized).not.toContain('Shippo provider error');
	});

	it.each([
		'unauthorized',
		'invalid-payload',
		'unprocessable',
		'provider-error',
		'shippo-shipment-malformed-json',
		'shippo-shipment-invalid-body',
		'shippo-delay',
		'shippo-shipment-disconnect',
	] satisfies StubScenario[])('does not persist a quote for a controlled shipment failure: %s', async (scenario) => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await setProviderScenario(shippoUrl(), scenario);
		const response = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: item.id },
		);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ message: 'Shipping provider request failed' });
		const { db } = getTestDatabase();
		expect(await db.select().from(shipping_quotes).where(eq(shipping_quotes.item_id, item.id))).toEqual([]);
	});

	it.each(['item_weight', 'item_length', 'item_width', 'item_height'] as const)(
		'rejects a missing %s before Shippo and quote persistence',
		async (dimension) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db
				.update(items)
				.set({ [dimension]: null })
				.where(eq(items.id, item.id));
			const beforeCount = (await getProviderRequests(shippoUrl())).length;
			const response = await authenticatedRequest(
				'/shipment_provider/auth/calculate_shipment_cost',
				'POST',
				actors.buyer.jar,
				{ item_id: item.id },
			);
			expect(response.status).toBe(400);
			await expectNoNewProviderRequests(beforeCount);
			expect(await db.select().from(shipping_quotes).where(eq(shipping_quotes.item_id, item.id))).toEqual([]);
		},
	);

	it('rejects missing item/address/dimensions and seller-as-buyer before Shippo or partial quote state', async () => {
		const cases = [
			async () => {
				const actors = await createCommerceActors();
				return { actors, itemId: 2_147_483_647, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				const { db } = getTestDatabase();
				await db.update(items).set({ item_weight: null }).where(eq(items.id, item.id));
				return { actors, itemId: item.id, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				const { db } = getTestDatabase();
				await db.update(addresses).set({ status: 'inactive' }).where(eq(addresses.id, actors.buyer.address.id));
				return { actors, itemId: item.id, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				const { db } = getTestDatabase();
				await db.update(addresses).set({ status: 'inactive' }).where(eq(addresses.id, actors.seller.address.id));
				return { actors, itemId: item.id, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				return { actors, itemId: item.id, jar: actors.seller.jar };
			},
		];
		for (const setup of cases) {
			const { itemId, jar } = await setup();
			const beforeCount = (await getProviderRequests(shippoUrl())).length;
			const response = await authenticatedRequest('/shipment_provider/auth/calculate_shipment_cost', 'POST', jar, {
				item_id: itemId,
			});
			expect(response.status).toBe(400);
			await expectNoNewProviderRequests(beforeCount);
		}
		const { db } = getTestDatabase();
		expect(await db.select().from(shipping_quotes)).toEqual([]);
	});

	it.each([
		'provider-error',
		'shippo-rate-malformed-json',
		'shippo-rate-invalid-body',
		'shippo-rate-delay',
		'shippo-rate-disconnect',
		'shippo-rate-shipment-mismatch',
		'shippo-label-malformed-json',
		'shippo-label-invalid-body',
		'shippo-label-delay',
		'shippo-label-disconnect',
		'shippo-label-status-error',
	] satisfies StubScenario[])('returns no label and preserves the order parent shipment on %s', async (scenario) => {
		const { actors, order, quote } = await prepareLabelOrder();
		await setProviderScenario(shippoUrl(), scenario);
		const response = await authenticatedRequest('/shipment_provider/auth/create_label', 'POST', actors.seller.jar, {
			order_id: order.id,
			rate_id: 'rate-test',
		});
		expect(response.status).toBe(502);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder?.shipping_label_id).toBe(quote.shipment_label_id);
	});

	it('returns typed redacted boundary errors and never logs provider payloads or credentials', async () => {
		const spies = [
			vi.spyOn(console, 'log').mockImplementation(() => undefined),
			vi.spyOn(console, 'warn').mockImplementation(() => undefined),
			vi.spyOn(console, 'error').mockImplementation(() => undefined),
		];
		try {
			await setProviderScenario(shippoUrl(), 'provider-error');
			const error = await new ShipmentService().listActiveCarriers().catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(ShippoProviderError);
			expect(error).toMatchObject({
				name: 'ShippoProviderError',
				provider: 'shippo',
				operation: 'list_carriers',
				category: 'http',
				status: 500,
				message: 'Shipping provider request failed',
			});
			const serialized = JSON.stringify(error);
			expect(serialized).not.toContain(environment.SHIPPING_PROVIDER_API_KEY);
			expect(serialized).not.toContain('Shippo provider error');
			for (const spy of spies) expect(spy).not.toHaveBeenCalled();
		} finally {
			for (const spy of spies) spy.mockRestore();
		}
	});

	it('requires authentication and a valid positive order/rate payload before provider I/O', async () => {
		const before = await getProviderRequests(shippoUrl());
		const unauthenticated = await app.request(
			'/shipment_provider/auth/create_label',
			jsonRequest('POST', { order_id: 1, rate_id: 'rate-test' }),
		);
		expect(unauthenticated.status).toBe(401);

		const actors = await createCommerceActors();
		for (const body of [
			{},
			{ order_id: 0, rate_id: 'rate-test' },
			{ order_id: 1.5, rate_id: 'rate-test' },
			{ order_id: 2_147_483_648, rate_id: 'rate-test' },
			{ order_id: 1, rate_id: '' },
		]) {
			const response = await authenticatedRequest(
				'/shipment_provider/auth/create_label',
				'POST',
				actors.seller.jar,
				body,
			);
			expect(response.status).toBe(400);
		}
		expect(await getProviderRequests(shippoUrl())).toEqual(before);

		const outOfRangeItem = await authenticatedRequest(
			'/shipment_provider/auth/calculate_shipment_cost',
			'POST',
			actors.buyer.jar,
			{ item_id: 2_147_483_648 },
		);
		expect(outOfRangeItem.status).toBe(400);
		expect(await getProviderRequests(shippoUrl())).toEqual(before);
	});
});
