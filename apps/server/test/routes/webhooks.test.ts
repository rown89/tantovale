import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

import { app } from '../../src/app';
import {
	type EntityTrustapTransactionStatus,
	entityTrustapTransactionTypeValues,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import { entityTrustapTransactions, orders } from '../../src/database/schemas/schema';
import { createCommerceActors, createItemFixture, createOrderFixture } from '../fixtures/commerce';
import { getTestDatabase } from '../helpers/database';
import { itemCommerceLockScope } from '../../src/lib/item-commerce-lock';

const mappedStatuses = [
	[entityTrustapTransactionTypeValues.CREATED, ORDER_PHASES.PAYMENT_PENDING],
	[entityTrustapTransactionTypeValues.JOINED, ORDER_PHASES.PAYMENT_PENDING],
	[entityTrustapTransactionTypeValues.PAID, ORDER_PHASES.PAYMENT_CONFIRMED],
	[entityTrustapTransactionTypeValues.TRACKED, ORDER_PHASES.SHIPPING_CONFIRMED],
	[entityTrustapTransactionTypeValues.DELIVERED, ORDER_PHASES.COMPLETED],
	[entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED, ORDER_PHASES.COMPLETED],
	[entityTrustapTransactionTypeValues.FUNDS_RELEASED, ORDER_PHASES.COMPLETED],
	[entityTrustapTransactionTypeValues.REJECTED, ORDER_PHASES.PAYMENT_FAILED],
	[entityTrustapTransactionTypeValues.CANCELLED, ORDER_PHASES.CANCELLED],
	[entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT, ORDER_PHASES.PAYMENT_REFUNDED],
	[entityTrustapTransactionTypeValues.PAYMENT_REFUNDED, ORDER_PHASES.PAYMENT_REFUNDED],
] as const;

async function createProviderBackedOrder(
	initialStatus: EntityTrustapTransactionStatus = entityTrustapTransactionTypeValues.CREATED,
) {
	const actors = await createCommerceActors();
	const item = await createItemFixture(actors);
	const transactionId = '1900001';
	const order = await createOrderFixture(actors, item, {
		item_price: item.price,
		payment_transaction_id: transactionId,
		payment_creation_state: 'created',
	});
	const { db } = getTestDatabase();
	await db.insert(entityTrustapTransactions).values({
		entityId: item.id,
		sellerId: actors.seller.profile.payment_provider_id,
		buyerId: actors.buyer.profile.payment_provider_id,
		transactionId,
		status: initialStatus,
		price: item.price + order.platform_charge,
		charge: order.payment_provider_charge,
		chargeSeller: 0,
		entityTitle: item.title,
	});
	return { item, order, transactionId };
}

async function waitForBlockedRequests(blocker: PoolClient, blockingProcessId: number, expected: number): Promise<void> {
	const deadline = Date.now() + 3_000;
	do {
		const { rows } = await blocker.query<{ blocked_count: number }>(
			`SELECT count(*)::int AS blocked_count
			 FROM pg_locks AS waiting
			 JOIN pg_locks AS holding
			   ON holding.locktype = waiting.locktype
			  AND holding.database IS NOT DISTINCT FROM waiting.database
			  AND holding.classid IS NOT DISTINCT FROM waiting.classid
			  AND holding.objid IS NOT DISTINCT FROM waiting.objid
			  AND holding.objsubid IS NOT DISTINCT FROM waiting.objsubid
			 WHERE NOT waiting.granted AND holding.granted AND holding.pid = $1`,
			[blockingProcessId],
		);
		if ((rows[0]?.blocked_count ?? 0) >= expected) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
	} while (Date.now() < deadline);
	throw new Error(`Expected ${expected} webhook request(s) to wait on blocker ${blockingProcessId}`);
}

async function postStatus(transactionId: string, status: string): Promise<Response> {
	return app.request('/webhooks/trustap/transaction-update', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
		},
		body: JSON.stringify({ event: 'transaction_status_updated', transaction_id: transactionId, status }),
	});
}

describe('Trustap transaction webhook state mapping', () => {
	it('persists a numeric max-int64 webhook id without precision loss', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const transactionId = '9223372036854775807';
		const order = await createOrderFixture(actors, item, {
			item_price: item.price,
			payment_transaction_id: transactionId,
			payment_creation_state: 'created',
		});
		const { db } = getTestDatabase();
		await db.insert(entityTrustapTransactions).values({
			entityId: item.id,
			sellerId: actors.seller.profile.payment_provider_id,
			buyerId: actors.buyer.profile.payment_provider_id,
			transactionId,
			status: entityTrustapTransactionTypeValues.CREATED,
			price: item.price + order.platform_charge,
			charge: order.payment_provider_charge,
			chargeSeller: 0,
			entityTitle: item.title,
		});

		const response = await app.request('/webhooks/trustap/transaction-update', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
			},
			body: `{"event":"transaction_status_updated","transaction_id":${transactionId},"status":"paid"}`,
		});

		expect(response.status).toBe(200);
		const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(stored).toMatchObject({ payment_transaction_id: transactionId, status: ORDER_PHASES.PAYMENT_CONFIRMED });
	});

	it.each([
		undefined,
		'Bearer trustap-webhook-test-secret',
		'Basic definitely-not-base64',
		`Basic ${Buffer.from('wrong:credentials').toString('base64')}`,
	])('rejects an unauthenticated webhook before reading or mutating its body (%s)', async (authorization) => {
		const { order, transactionId } = await createProviderBackedOrder();
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (authorization) headers.authorization = authorization;

		const response = await app.request('/webhooks/trustap/transaction-update', {
			method: 'POST',
			headers,
			body: JSON.stringify({ event: 'transaction_status_updated', transaction_id: transactionId, status: 'paid' }),
		});

		expect(response.status).toBe(401);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
	});

	it.each(mappedStatuses)('maps Trustap %s to order phase %s', async (remoteStatus, expectedOrderStatus) => {
		const { order, transactionId } = await createProviderBackedOrder();

		const response = await postStatus(transactionId, remoteStatus);

		expect(response.status).toBe(200);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(expectedOrderStatus);
		expect(storedProvider?.status).toBe(remoteStatus);
	});

	it('fail-closes a complaint without lying about the current order phase', async () => {
		const { order, transactionId } = await createProviderBackedOrder();

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.COMPLAINED)).status).toBe(200);

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.COMPLAINED);
	});

	it.each([
		['complaint then refund', true],
		['missed complaint then refund', false],
	] as const)('accepts the authoritative refund after delivery (%s)', async (_label, sendComplaint) => {
		const { order, transactionId } = await createProviderBackedOrder(entityTrustapTransactionTypeValues.DELIVERED);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.COMPLETED }).where(eq(orders.id, order.id));
		if (sendComplaint) {
			expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.COMPLAINED)).status).toBe(200);
			const [complainedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(complainedOrder).toMatchObject({
				status: ORDER_PHASES.COMPLETED,
				payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
			});
		}

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.PAYMENT_REFUNDED)).status).toBe(200);
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_REFUNDED,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
		});
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.PAYMENT_REFUNDED);
	});

	it.each([
		entityTrustapTransactionTypeValues.REJECTED,
		entityTrustapTransactionTypeValues.CANCELLED,
		entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT,
		entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
	])('resolves a same-status %s cancellation reconciliation marker', async (status) => {
		const { order, transactionId } = await createProviderBackedOrder(status);
		const { db } = getTestDatabase();
		const expectedOrderStatus = mappedStatuses.find(([providerStatus]) => providerStatus === status)?.[1];
		if (!expectedOrderStatus) throw new Error(`Missing expected order status for ${status}`);
		await db
			.update(orders)
			.set({
				status: expectedOrderStatus,
				payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
			})
			.where(eq(orders.id, order.id));

		expect((await postStatus(transactionId, status)).status).toBe(200);

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder?.payment_cancellation_state).toBe(PAYMENT_CANCELLATION_STATES.CANCELLED);
	});

	it('ignores an out-of-order active regression and preserves the newest local phase', async () => {
		const { order, transactionId } = await createProviderBackedOrder(entityTrustapTransactionTypeValues.DELIVERED);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.SHIPPING_CONFIRMED }).where(eq(orders.id, order.id));

		const response = await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID);

		expect(response.status).toBe(200);
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.SHIPPING_CONFIRMED);
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.DELIVERED);
	});

	it('does not reactivate a provider row that was permanently quarantined', async () => {
		const { order, transactionId } = await createProviderBackedOrder();
		const { db } = getTestDatabase();
		await db
			.update(entityTrustapTransactions)
			.set({ quarantined: true })
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		await db.update(orders).set({ payment_creation_state: 'reconciliation_required' }).where(eq(orders.id, order.id));

		const response = await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID);

		expect(response.status).toBe(200);
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(storedProvider).toMatchObject({
			quarantined: true,
			status: entityTrustapTransactionTypeValues.CREATED,
		});
	});

	it('rejects an unknown provider state without corrupting the order or provider row', async () => {
		const { order, transactionId } = await createProviderBackedOrder();

		const response = await postStatus(transactionId, 'provider_added_a_new_state');

		expect(response.status).toBe(400);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.CREATED);
	});

	it('serializes out-of-order updates through the exact item advisory lock and a re-read provider row lock', async () => {
		const { item, transactionId } = await createProviderBackedOrder();
		const { client } = getTestDatabase();
		const advisoryBlocker = await client.connect();
		const rowBlocker = await client.connect();
		try {
			await advisoryBlocker.query('BEGIN');
			await rowBlocker.query('BEGIN');
			const advisoryPid = (await advisoryBlocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
			const rowPid = (await rowBlocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
			if (!advisoryPid || !rowPid) throw new Error('Missing blocker PID');
			await advisoryBlocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				item.id,
			]);
			await rowBlocker.query('SELECT id FROM entity_trustap_transactions WHERE transaction_id = $1 FOR UPDATE', [
				transactionId,
			]);

			const trackedPromise = postStatus(transactionId, entityTrustapTransactionTypeValues.TRACKED);
			await waitForBlockedRequests(advisoryBlocker, advisoryPid, 1);
			const paidPromise = postStatus(transactionId, entityTrustapTransactionTypeValues.PAID);
			await waitForBlockedRequests(advisoryBlocker, advisoryPid, 2);
			await advisoryBlocker.query('COMMIT');
			await waitForBlockedRequests(rowBlocker, rowPid, 1);
			await rowBlocker.query('COMMIT');

			expect((await trackedPromise).status).toBe(200);
			expect((await paidPromise).status).toBe(200);
			const { db } = getTestDatabase();
			const [storedOrder] = await db.select().from(orders).where(eq(orders.payment_transaction_id, transactionId));
			const [storedProvider] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
			expect(storedOrder?.status).toBe(ORDER_PHASES.SHIPPING_CONFIRMED);
			expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.TRACKED);
		} finally {
			await advisoryBlocker.query('ROLLBACK').catch(() => undefined);
			await rowBlocker.query('ROLLBACK').catch(() => undefined);
			advisoryBlocker.release();
			rowBlocker.release();
		}
	});
});
