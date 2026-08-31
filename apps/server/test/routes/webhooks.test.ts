import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

import { app } from '../../src/app';
import {
	type EntityTrustapTransactionStatus,
	entityTrustapTransactionTypeValues,
	ORDER_PHASES,
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

async function waitForBlockedRequest(blocker: PoolClient, blockingProcessId: number): Promise<void> {
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
		if ((rows[0]?.blocked_count ?? 0) > 0) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	} while (Date.now() < deadline);
	throw new Error('Webhook never waited on the item commerce lock');
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

	it('serializes payment updates on the same item commerce lock used by expiry and checkout', async () => {
		const { item, transactionId } = await createProviderBackedOrder();
		const { client } = getTestDatabase();
		const blocker = await client.connect();
		try {
			await blocker.query('BEGIN');
			const pidResult = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
			const blockerPid = pidResult.rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing blocker PID');
			await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				item.id,
			]);

			const responsePromise = postStatus(transactionId, entityTrustapTransactionTypeValues.PAID);
			await waitForBlockedRequest(blocker, blockerPid);
			await blocker.query('COMMIT');

			expect((await responsePromise).status).toBe(200);
		} finally {
			await blocker.query('ROLLBACK').catch(() => undefined);
			blocker.release();
		}
	});
});
