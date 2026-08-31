import { and, eq } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { addressStatus, itemStatus, ORDER_PHASES } from '../../src/database/schemas/enumerated_values';
import { addresses, entityTrustapTransactions, items, orders, profiles } from '../../src/database/schemas/schema';
import { calculatePlatformFee } from '../../src/utils/platform-costs';
import { itemCommerceLockScope } from '../../src/lib/item-commerce-lock';
import { PaymentProviderService } from '../../src/routes/payments/payment-provider.service';
import { createCommerceActors, createItemFixture } from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { getProviderRequests, setProviderScenario } from '../helpers/providers';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL' | 'SHIPPING_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	const parsed = new URL(value);
	if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') throw new Error(`Unsafe ${name}`);
	return value;
}

async function buyNow(jar: Parameters<typeof authenticatedRequest>[2], itemId: number): Promise<Response> {
	return authenticatedRequest('/item/auth/buy_now', 'POST', jar, { item_id: itemId });
}

async function mailCount(recipient: string): Promise<number> {
	/* eslint-disable turbo/no-undeclared-env-vars -- Vitest injects an isolated loopback Mailpit URL. */
	const value = process.env.MAILPIT_API_URL;
	if (!value) throw new Error('Missing MAILPIT_API_URL');
	const url = new URL('/api/v1/search', value);
	if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
		throw new Error('Unsafe MAILPIT_API_URL');
	}
	url.searchParams.set('query', `to:${recipient}`);
	const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
	if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
	const body = (await response.json()) as { messages: Array<{ To: Array<{ Address: string }> }> };
	return body.messages.filter(({ To }) => To.some(({ Address }) => Address === recipient)).length;
}

async function setTrustapTransactionScenario(scenario: 'transaction-error' | 'transaction-disconnect'): Promise<void> {
	const response = await fetch(`${providerUrl('PAYMENT_PROVIDER_API_URL')}/__test/scenario`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ scenario }),
		signal: AbortSignal.timeout(2_000),
	});
	expect(response.status).toBe(200);
}

async function waitForBlockedRequests(blocker: PoolClient, blockingProcessId: number): Promise<number> {
	const deadline = Date.now() + 3_000;
	do {
		const { rows } = await blocker.query<{ blocked_count: number }>(
			`SELECT count(*)::int AS blocked_count
			 FROM pg_stat_activity
			 WHERE $1 = ANY(pg_blocking_pids(pid))`,
			[blockingProcessId],
		);
		const blockedCount = rows[0]?.blocked_count ?? 0;
		if (blockedCount > 0) return blockedCount;
		await new Promise((resolve) => setTimeout(resolve, 20));
	} while (Date.now() < deadline);

	throw new Error('Concurrent buy-now requests never waited on the item commerce lock');
}

describe('platform costs route', () => {
	it('requires authentication', async () => {
		const response = await app.request('/platforms_costs/auth/calculate_platform_costs', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ price: 12_000, shipping_price: 750 }),
		});
		expect(response.status).toBe(401);
	});

	it.each([
		{ price: 0, shipping_price: 750 },
		{ price: -1, shipping_price: 750 },
		{ price: 12_000.5, shipping_price: 750 },
		{ price: 12_000, shipping_price: 0 },
		{ price: 12_000, shipping_price: -1 },
		{ price: 12_000, shipping_price: 750.5 },
		{ price: 2_147_483_648, shipping_price: 750 },
	])('rejects non-positive, non-integer, or out-of-range cent values: %j', async (body) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest(
			'/platforms_costs/auth/calculate_platform_costs',
			'POST',
			actors.buyer.jar,
			body,
		);
		expect(response.status).toBe(400);
	});

	it('returns exact integer-cent platform and Trustap costs with configured expiry', async () => {
		const actors = await createCommerceActors();
		const price = 12_000;
		const shippingPrice = 750;
		const platformCharge = Math.round(price * calculatePlatformFee(price));
		const transactionPrice = price + platformCharge;
		const response = await authenticatedRequest(
			'/platforms_costs/auth/calculate_platform_costs',
			'POST',
			actors.buyer.jar,
			{ price, shipping_price: shippingPrice },
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			platform_charge: platformCharge,
			payment_provider_charge: Math.round(transactionPrice * 0.05),
			/* eslint-disable turbo/no-undeclared-env-vars -- Assertion covers the worker-local parsed environment. */
			proposalExpireTime: Number(process.env.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS),
		});

		const requests = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			method: 'GET',
			path: `/api/v1/charge?price=${transactionPrice}&currency=eur&postage_fee=${shippingPrice}&use_hr_post=false`,
		});
	});
});

describe('buy-now route', () => {
	it('requires authentication', async () => {
		const response = await app.request('/item/auth/buy_now', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ item_id: 1 }),
		});
		expect(response.status).toBe(401);
	});

	it('creates one coherent payment-pending order from active addresses and provider identities', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const response = await buyNow(actors.buyer.jar, item.id);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			success: boolean;
			order: { id: number; status: string };
			payment_url: string;
			message: string;
		};
		expect(body).toMatchObject({
			success: true,
			order: { status: ORDER_PHASES.PAYMENT_PENDING },
			message: 'Order created, complete the payment for the next step',
		});
		expect(body.payment_url).toContain('/guest_pay?redirect_uri=');

		const { db } = getTestDatabase();
		const [order] = await db.select().from(orders).where(eq(orders.id, body.order.id));
		expect(order).toMatchObject({
			item_id: item.id,
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			buyer_address: actors.buyer.address.id,
			seller_address: actors.seller.address.id,
			shipping_label_id: 'shipment-test',
			shipping_price: 750,
			status: ORDER_PHASES.PAYMENT_PENDING,
		});
		expect(order?.payment_transaction_id).toEqual(expect.any(Number));

		const transactionRows = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.entityId, item.id));
		expect(transactionRows).toHaveLength(1);
		expect(transactionRows[0]).toMatchObject({
			transactionId: order?.payment_transaction_id,
			buyerId: actors.buyer.profile.payment_provider_id,
			sellerId: actors.seller.profile.payment_provider_id,
			price: item.price + (order?.platform_charge ?? 0),
			charge: order?.payment_provider_charge,
		});

		const shippoRequests = await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'));
		expect(shippoRequests).toHaveLength(1);
		expect(shippoRequests[0]).toMatchObject({ method: 'POST', path: '/shipments' });
		const shippoBody = shippoRequests[0]?.body as {
			address_from: { metadata: string };
			address_to: { metadata: string };
		};
		expect(shippoBody.address_from.metadata).toBe(`profile_id: ${actors.seller.profile.id}`);
		expect(shippoBody.address_to.metadata).toBe(`profile_id: ${actors.buyer.profile.id}`);

		const trustapRequests = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		expect(trustapRequests.map(({ method, path }) => `${method} ${path.split('?')[0]}`)).toEqual([
			'GET /api/v1/charge',
			'POST /api/v1/me/transactions/create_with_guest_user',
		]);
		expect(trustapRequests[1]?.body).toMatchObject({
			buyer_id: actors.buyer.profile.payment_provider_id,
			seller_id: actors.seller.profile.payment_provider_id,
			creator_role: 'buyer',
			price: item.price + (order?.platform_charge ?? 0),
			postage_fee: 750,
			charge: order?.payment_provider_charge,
		});
		expect(trustapRequests[1]?.headers['trustap-user']).toBe(actors.buyer.profile.payment_provider_id);
		expect(await mailCount(actors.buyer.user.email)).toBe(1);
	});

	it('rejects own, unavailable, missing-provider, missing-active-address, and duplicate purchases without partial rows', async () => {
		const cases = [
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				return { actors, item, jar: actors.seller.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors, { commons: { title: 'Unavailable item' } });
				const { db } = getTestDatabase();
				await db.update(items).set({ status: itemStatus.SOLD }).where(eq(items.id, item.id));
				return { actors, item, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors, { commons: { title: 'Missing provider item' } });
				const { db } = getTestDatabase();
				await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.buyer.profile.id));
				return { actors, item, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors, { commons: { title: 'Missing seller provider item' } });
				const { db } = getTestDatabase();
				await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.seller.profile.id));
				return { actors, item, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors, { commons: { title: 'Missing address item' } });
				const { db } = getTestDatabase();
				await db
					.update(addresses)
					.set({ status: addressStatus.INACTIVE })
					.where(eq(addresses.id, actors.buyer.address.id));
				return { actors, item, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors, { commons: { title: 'Inactive seller address item' } });
				const { db } = getTestDatabase();
				await db
					.update(addresses)
					.set({ status: addressStatus.INACTIVE })
					.where(eq(addresses.id, actors.seller.address.id));
				return { actors, item, jar: actors.buyer.jar };
			},
			async () => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors, {
					commons: { title: 'Disabled Easy Pay item', easy_pay: false },
				});
				return { actors, item, jar: actors.buyer.jar };
			},
		];

		for (const prepare of cases) {
			const { actors, item, jar } = await prepare();
			const response = await buyNow(jar, item.id);
			expect([400, 404]).toContain(response.status);
			const { db } = getTestDatabase();
			expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
			expect(
				await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
			).toEqual([]);
			expect(await mailCount(actors.buyer.user.email)).toBe(0);
		}

		const actors = await createCommerceActors();
		const item = await createItemFixture(actors, { commons: { title: 'Duplicate buy now item' } });
		expect((await buyNow(actors.buyer.jar, item.id)).status).toBe(200);
		const duplicate = await buyNow(actors.buyer.jar, item.id);
		expect(duplicate.status).toBe(400);
		const { db } = getTestDatabase();
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toHaveLength(1);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toHaveLength(1);
	});

	it.each(['SHIPPING_PROVIDER_API_URL', 'PAYMENT_PROVIDER_API_URL'] as const)(
		'cleans every local row and emits no email when %s fails',
		async (providerName) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			await setProviderScenario(providerUrl(providerName), 'provider-error');

			const response = await buyNow(actors.buyer.jar, item.id);
			expect(response.status).toBe(500);

			const { db } = getTestDatabase();
			expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
			expect(
				await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
			).toEqual([]);
			expect(await mailCount(actors.buyer.user.email)).toBe(0);
		},
	);

	it('removes its local reservation when Trustap transaction creation fails after a successful charge', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await setTrustapTransactionScenario('transaction-error');

		const response = await buyNow(actors.buyer.jar, item.id);
		expect(response.status).toBe(500);
		const requests = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		expect(requests.map(({ method, path }) => `${method} ${path.split('?')[0]}`)).toEqual([
			'GET /api/v1/charge',
			'POST /api/v1/me/transactions/create_with_guest_user',
		]);
		const { db } = getTestDatabase();
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toEqual([]);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toEqual([]);
		expect(await mailCount(actors.buyer.user.email)).toBe(0);
	});

	it('keeps a durable reservation when Trustap creates remotely but the response is lost', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		await setTrustapTransactionScenario('transaction-disconnect');

		const response = await buyNow(actors.buyer.jar, item.id);
		expect(response.status).toBe(500);
		const { db } = getTestDatabase();
		const reservations = await db.select().from(orders).where(eq(orders.item_id, item.id));
		expect(reservations).toHaveLength(1);
		expect(reservations[0]?.payment_transaction_id).toBeNull();
		expect(await new PaymentProviderService().getTransactionStatus(trustapTransactionFixture.id + 1)).toMatchObject({
			id: trustapTransactionFixture.id + 1,
			buyer_id: actors.buyer.profile.payment_provider_id,
			seller_id: actors.seller.profile.payment_provider_id,
		});

		const retry = await buyNow(actors.buyer.jar, item.id);
		expect(retry.status).toBe(400);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
	});

	it('keeps a durable reservation and blocks retry if Trustap succeeds but final local persistence fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const conflictingItem = await createItemFixture(actors, { commons: { title: 'Transaction conflict item' } });
		const expectedTransactionId = trustapTransactionFixture.id + 1;
		const { db } = getTestDatabase();
		await db.insert(entityTrustapTransactions).values({
			entityId: conflictingItem.id,
			sellerId: actors.seller.profile.payment_provider_id,
			buyerId: actors.buyer.profile.payment_provider_id,
			transactionId: expectedTransactionId,
			status: 'created',
			price: 1,
			charge: 0,
			chargeSeller: 0,
			entityTitle: conflictingItem.title,
		});

		const response = await buyNow(actors.buyer.jar, item.id);
		expect(response.status).toBe(500);
		const reservations = await db.select().from(orders).where(eq(orders.item_id, item.id));
		expect(reservations).toHaveLength(1);
		expect(reservations[0]).toMatchObject({
			buyer_id: actors.buyer.profile.id,
			seller_id: actors.seller.profile.id,
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_transaction_id: null,
		});
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toEqual([]);
		expect(await mailCount(actors.buyer.user.email)).toBe(0);

		const retry = await buyNow(actors.buyer.jar, item.id);
		expect(retry.status).toBe(400);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
	});

	it('serializes concurrent purchases to one order and one Trustap transaction without pool starvation', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const { client } = getTestDatabase();
		const blocker = await client.connect();
		let released = false;
		let responsesPromise: Promise<Response[]> | undefined;
		try {
			await blocker.query('BEGIN');
			const processResult = await blocker.query<{ process_id: number }>('SELECT pg_backend_pid() AS process_id');
			await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				item.id,
			]);
			responsesPromise = Promise.all(Array.from({ length: 12 }, () => buyNow(actors.buyer.jar, item.id)));
			expect(await waitForBlockedRequests(blocker, processResult.rows[0]!.process_id)).toBeGreaterThan(0);
			await blocker.query('COMMIT');
			released = true;
		} finally {
			if (!released) await blocker.query('ROLLBACK');
			blocker.release();
		}
		if (!responsesPromise) throw new Error('Concurrent requests were not started');
		const responses = await Promise.race([
			responsesPromise,
			new Promise<never>((_resolve, reject) =>
				setTimeout(() => reject(new Error('Concurrent buy-now requests starved the database pool')), 8_000),
			),
		]);

		expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
		expect(responses.filter(({ status }) => status === 400)).toHaveLength(11);
		const { db } = getTestDatabase();
		expect(await db.select().from(orders).where(eq(orders.item_id, item.id))).toHaveLength(1);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toHaveLength(1);
		expect(await getProviderRequests(providerUrl('SHIPPING_PROVIDER_API_URL'))).toHaveLength(1);
		const chargeRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'GET' && path.startsWith('/api/v1/charge?'),
		);
		expect(chargeRequests).toHaveLength(1);
		const transactionRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ method, path }) => method === 'POST' && path === '/api/v1/me/transactions/create_with_guest_user',
		);
		expect(transactionRequests).toHaveLength(1);
	});

	it('persists a successful order even when buyer email delivery fails', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		/* eslint-disable turbo/no-undeclared-env-vars -- Test temporarily directs SMTP to a closed loopback port. */
		const originalPort = process.env.SMTP_PORT;
		process.env.SMTP_PORT = '1';
		try {
			const response = await buyNow(actors.buyer.jar, item.id);
			expect(response.status).toBe(200);
		} finally {
			process.env.SMTP_PORT = originalPort;
		}

		const { db } = getTestDatabase();
		expect(
			await db
				.select()
				.from(orders)
				.where(and(eq(orders.item_id, item.id), eq(orders.buyer_id, actors.buyer.profile.id))),
		).toHaveLength(1);
		expect(
			await db.select().from(entityTrustapTransactions).where(eq(entityTrustapTransactions.entityId, item.id)),
		).toHaveLength(1);
	});
});
