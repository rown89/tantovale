import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

import { app } from '../../src/app';
import {
	type EntityTrustapTransactionStatus,
	entityTrustapTransactionTypeValues,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import { commerce_reconciliation_audit, entityTrustapTransactions, orders } from '../../src/database/schemas/schema';
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

const webhookAuthorization = `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString(
	'base64',
)}`;
const trustapV1TimestampFields = [
	'created',
	'joined',
	'paid',
	'tracked',
	'delivered',
	'complained',
	'complaint_period_deadline',
	'complaint_period_ended',
	'funds_released',
	'rejected',
	'cancelled',
	'cancelled_with_payment',
	'payment_refunded',
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

async function postWebhookBody(
	body: string,
	authorization = webhookAuthorization,
	additionalHeaders: Record<string, string> = {},
): Promise<Response> {
	return app.request('/webhooks/trustap/transaction-update', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization,
			...additionalHeaders,
		},
		body,
	});
}

function trustapV1WebhookPayload(
	transactionId: string,
	status: string,
	targetPreview: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		code: `basic_tx.${status}`,
		user_id: 'guest-buyer-test',
		target_id: transactionId,
		target_preview: {
			id: transactionId,
			status,
			...targetPreview,
		},
		time: '2026-08-30T12:00:00.000Z',
		metadata: {},
	};
}

async function postStatus(transactionId: string, status: string): Promise<Response> {
	return postWebhookBody(JSON.stringify(trustapV1WebhookPayload(transactionId, status)));
}

describe('Trustap transaction webhook state mapping', () => {
	it.each([
		[
			'crashed in-flight cancellation',
			PAYMENT_CANCELLATION_STATES.CANCELLING,
			entityTrustapTransactionTypeValues.CANCELLED,
			ORDER_PHASES.EXPIRED,
			PAYMENT_CANCELLATION_STATES.CANCELLED,
		],
		[
			'ambiguous cancellation timeout',
			PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
			entityTrustapTransactionTypeValues.CANCELLED,
			ORDER_PHASES.EXPIRED,
			PAYMENT_CANCELLATION_STATES.CANCELLED,
		],
		[
			'fresh cancellation observes payment without releasing its owner lease',
			PAYMENT_CANCELLATION_STATES.CANCELLING,
			entityTrustapTransactionTypeValues.PAID,
			ORDER_PHASES.PAYMENT_CONFIRMED,
			PAYMENT_CANCELLATION_STATES.CANCELLING,
		],
		[
			'ambiguous cancellation overtaken by tracking',
			PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
			entityTrustapTransactionTypeValues.TRACKED,
			ORDER_PHASES.SHIPPING_CONFIRMED,
			PAYMENT_CANCELLATION_STATES.NONE,
		],
	] as const)(
		'recovers a %s from authoritative Trustap state',
		async (_case, cancellationState, providerStatus, expectedOrderStatus, expectedCancellationState) => {
			const { order, transactionId } = await createProviderBackedOrder();
			const { db } = getTestDatabase();
			await db.update(orders).set({ payment_cancellation_state: cancellationState }).where(eq(orders.id, order.id));

			const response = await postStatus(transactionId, providerStatus);

			expect(response.status).toBe(200);
			const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
			const [storedProvider] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
			expect(storedOrder).toMatchObject({
				status: expectedOrderStatus,
				payment_cancellation_state: expectedCancellationState,
			});
			expect(storedProvider?.status).toBe(providerStatus);
		},
	);

	it('keeps a fresh cancellation lease through a non-cancel update and its duplicate without timestamp churn', async () => {
		const { order, transactionId } = await createProviderBackedOrder();
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({ payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLING })
			.where(eq(orders.id, order.id));

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID)).status).toBe(200);
		const [orderAfterProgress] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [providerAfterProgress] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(orderAfterProgress).toMatchObject({
			status: ORDER_PHASES.PAYMENT_CONFIRMED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLING,
		});

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID)).status).toBe(200);
		const [orderAfterDuplicate] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [providerAfterDuplicate] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(orderAfterDuplicate?.updated_at).toEqual(orderAfterProgress?.updated_at);
		expect(providerAfterDuplicate?.updated_at).toEqual(providerAfterProgress?.updated_at);
		expect(orderAfterDuplicate?.payment_cancellation_state).toBe(PAYMENT_CANCELLATION_STATES.CANCELLING);
	});

	it('persists a max-int64 v1 webhook id without precision loss', async () => {
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
				authorization: webhookAuthorization,
			},
			body: JSON.stringify(trustapV1WebhookPayload(transactionId, 'paid')),
		});

		expect(response.status).toBe(200);
		const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(stored).toMatchObject({ payment_transaction_id: transactionId, status: ORDER_PHASES.PAYMENT_CONFIRMED });
	});

	it.each([
		['missing', undefined],
		['wrong scheme', 'Bearer trustap-webhook-test-secret'],
		['malformed base64', 'Basic definitely-not-base64'],
		['base64 with trailing garbage', `${webhookAuthorization}!`],
		['non-canonical unpadded base64', webhookAuthorization.replace(/=+$/u, '')],
		[
			'equal-length wrong username',
			`Basic ${Buffer.from('wrustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
		],
		['different-length wrong username', `Basic ${Buffer.from('wrong:trustap-webhook-test-secret').toString('base64')}`],
		[
			'equal-length wrong password',
			`Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secrex').toString('base64')}`,
		],
		['different-length wrong password', `Basic ${Buffer.from('trustap-webhook-test-user:wrong').toString('base64')}`],
	] as const)('rejects %s Basic credentials before reading or mutating the body', async (_case, authorization) => {
		const { order } = await createProviderBackedOrder();
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (authorization) headers.authorization = authorization;

		const response = await app.request('/webhooks/trustap/transaction-update', {
			method: 'POST',
			headers,
			body: '{invalid-json',
		});

		expect(response.status).toBe(401);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
	});

	it.each([
		`basic ${webhookAuthorization.slice('Basic '.length)}`,
		`bAsIc    ${webhookAuthorization.slice('Basic '.length)}`,
	])('accepts a case-insensitive Basic scheme followed by one or more spaces', async (authorization) => {
		expect((await postWebhookBody('{invalid-json', authorization)).status).toBe(400);
	});

	it('rejects an authenticated request whose declared body exceeds 64 KiB before JSON parsing', async () => {
		const response = await postWebhookBody('{}', webhookAuthorization, { 'content-length': String(65_537) });

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: 'Webhook payload too large' });
	});

	it('rejects an authenticated streamed body that exceeds 64 KiB', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode('x'.repeat(32_768)));
				controller.enqueue(encoder.encode('x'.repeat(32_769)));
				controller.close();
			},
		});
		const request = new Request('http://localhost/webhooks/trustap/transaction-update', {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: webhookAuthorization },
			body: stream,
			duplex: 'half',
		} as RequestInit & { duplex: 'half' });

		const response = await app.request(request);

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: 'Webhook payload too large' });
	});

	it('authenticates before rejecting an oversized request body', async () => {
		const response = await postWebhookBody('{}', 'Basic invalid!', { 'content-length': String(65_537) });

		expect(response.status).toBe(401);
	});

	it.each([
		['invalid JSON', '{invalid-json'],
		[
			'legacy invented envelope',
			JSON.stringify({ event: 'transaction_updated', transaction_id: '1900001', status: 'paid' }),
		],
		['invalid target id', JSON.stringify(trustapV1WebhookPayload('01', 'paid'))],
		[
			'mismatched event status',
			JSON.stringify({ ...trustapV1WebhookPayload('1900001', 'paid'), code: 'basic_tx.tracked' }),
		],
		['mismatched preview id', JSON.stringify(trustapV1WebhookPayload('1900001', 'paid', { id: '1900002' }))],
		['invalid paid timestamp', JSON.stringify(trustapV1WebhookPayload('1900001', 'paid', { paid: 'not-a-timestamp' }))],
		[
			'v2 payload',
			JSON.stringify({
				code: 'tx.paid',
				target_id: 'tx_01kq9gj63sf4pbpesq9kna5ysa',
				target_preview: {
					id: 'tx_01kq9gj63sf4pbpesq9kna5ysa',
					buyer: { id: 'guest-buyer-test', is_guest: true },
					status: 'paid',
				},
			}),
		],
	] as const)('rejects %s as a non-v1 payload', async (_case, body) => {
		expect((await postWebhookBody(body)).status).toBe(400);
	});

	it('acknowledges and quarantines an unknown future v1 transaction status without mutating the order', async () => {
		const { order, transactionId } = await createProviderBackedOrder();
		const response = await postStatus(transactionId, 'provider_future_status');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			message: 'Unknown transaction status quarantined',
		});
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(storedProvider).toMatchObject({
			status: entityTrustapTransactionTypeValues.CREATED,
			quarantined: true,
		});
		expect(
			await db
				.select({ conflictType: commerce_reconciliation_audit.conflict_type })
				.from(commerce_reconciliation_audit)
				.where(eq(commerce_reconciliation_audit.original_reference, transactionId)),
		).toEqual([
			{ conflictType: 'runtime_unknown_provider_status' },
			{ conflictType: 'runtime_unknown_provider_status' },
		]);
	});

	it.each(trustapV1TimestampFields)('validates the known v1 %s timestamp when present', async (field) => {
		const body = JSON.stringify(
			trustapV1WebhookPayload('9223372036854775806', 'paid', {
				[field]: '2026-08-30T12:00:00+25:00',
			}),
		);

		expect((await postWebhookBody(body)).status).toBe(400);
	});

	it.each(['2026-08-30T12:00:00+25:00', '2026-08-30T12:00:00+99:00', '2026-02-31T12:00:00Z'])(
		'rejects an impossible provider timestamp %s without mutating commerce state',
		async (timestamp) => {
			const { order, transactionId } = await createProviderBackedOrder();
			const { db } = getTestDatabase();
			const [orderBefore] = await db.select().from(orders).where(eq(orders.id, order.id));
			const [providerBefore] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));

			const response = await postWebhookBody(
				JSON.stringify(trustapV1WebhookPayload(transactionId, 'paid', { complaint_period_deadline: timestamp })),
			);

			expect(response.status).toBe(400);
			expect(await db.select().from(orders).where(eq(orders.id, order.id))).toEqual([orderBefore]);
			expect(
				await db
					.select()
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, transactionId)),
			).toEqual([providerBefore]);
		},
	);

	it.each([
		`{"code":"basic_tx.paid","target_id":"1900001","target_id":"9223372036854775807","target_preview":{"id":"1900001","status":"paid"}}`,
		`{"code":"basic_tx.paid","target_id":"9223372036854775807","target_id":"1900001","target_preview":{"id":"1900001","status":"paid"}}`,
	])('rejects duplicate webhook target IDs without applying JSON first/last-key semantics', async (body) => {
		const { order, transactionId } = await createProviderBackedOrder();
		const { db } = getTestDatabase();
		const [orderBefore] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [providerBefore] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));

		expect((await postWebhookBody(body)).status).toBe(400);
		expect(await db.select().from(orders).where(eq(orders.id, order.id))).toEqual([orderBefore]);
		expect(
			await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId)),
		).toEqual([providerBefore]);
	});

	it('returns 404 for an unknown transaction without creating commerce state', async () => {
		const { db } = getTestDatabase();
		const providersBefore = await db.select().from(entityTrustapTransactions);
		const ordersBefore = await db.select().from(orders);

		const response = await postStatus('9223372036854775806', entityTrustapTransactionTypeValues.PAID);

		expect(response.status).toBe(404);
		expect(await db.select().from(entityTrustapTransactions)).toEqual(providersBefore);
		expect(await db.select().from(orders)).toEqual(ordersBefore);
	});

	it('returns 404 when the correlated order is missing without mutating provider evidence', async () => {
		const { order, transactionId } = await createProviderBackedOrder();
		const { db } = getTestDatabase();
		await db.delete(orders).where(eq(orders.id, order.id));
		const [providerBefore] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));

		const response = await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID);

		expect(response.status).toBe(404);
		const [providerAfter] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(providerAfter).toEqual(providerBefore);
	});

	it('accepts the official flat v1 envelope, strips benign extras, and applies the transition atomically', async () => {
		const { order, transactionId } = await createProviderBackedOrder();
		const complaintDeadline = '2026-09-01T12:00:00.000Z';

		const response = await postWebhookBody(
			JSON.stringify({
				...trustapV1WebhookPayload(transactionId, entityTrustapTransactionTypeValues.PAID, {
					buyer_id: 'guest-buyer-test',
					seller_id: 'guest-seller-test',
					created: '2026-08-30T10:00:00.000Z',
					joined: '2026-08-30T11:00:00.000Z',
					paid: '2026-08-30T12:00:00.000Z',
					complaint_period_deadline: complaintDeadline,
				}),
				webhook_delivery_id: 'benign-v1-delivery-metadata',
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, message: 'Transaction updated successfully' });
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_CONFIRMED);
		expect(storedProvider).toMatchObject({
			status: entityTrustapTransactionTypeValues.PAID,
			complaintPeriodDeadline: new Date(complaintDeadline),
		});
	});

	it('fails closed when the order points at an item different from the provider transaction lock identity', async () => {
		const { item, order, transactionId } = await createProviderBackedOrder();
		const actors = await createCommerceActors();
		const otherItem = await createItemFixture(actors);
		const { client, db } = getTestDatabase();
		await db.update(orders).set({ item_id: otherItem.id }).where(eq(orders.id, order.id));
		const [orderBefore] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [providerBefore] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		const blocker = await client.connect();
		try {
			await blocker.query('BEGIN');
			const blockerPid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing blocker PID');
			await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				item.id,
			]);
			const responsePromise = postStatus(transactionId, entityTrustapTransactionTypeValues.PAID);
			await waitForBlockedRequests(blocker, blockerPid, 1);
			await blocker.query('COMMIT');
			const response = await responsePromise;

			expect(response.status).toBe(409);
			expect(await db.select().from(orders).where(eq(orders.id, order.id))).toEqual([orderBefore]);
			expect(
				await db
					.select()
					.from(entityTrustapTransactions)
					.where(eq(entityTrustapTransactions.transactionId, transactionId)),
			).toEqual([providerBefore]);
		} finally {
			await blocker.query('ROLLBACK').catch(() => undefined);
			blocker.release();
		}
	});

	it('acknowledges a duplicate status without touching provider or order timestamps', async () => {
		const { order, transactionId } = await createProviderBackedOrder(entityTrustapTransactionTypeValues.PAID);
		const { db } = getTestDatabase();
		const stableTimestamp = new Date('2026-01-01T00:00:00.000Z');
		await db
			.update(entityTrustapTransactions)
			.set({ updated_at: stableTimestamp })
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		await db
			.update(orders)
			.set({ status: ORDER_PHASES.PAYMENT_CONFIRMED, updated_at: stableTimestamp })
			.where(eq(orders.id, order.id));

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID)).status).toBe(200);

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.updated_at).toEqual(stableTimestamp);
		expect(storedProvider?.updated_at).toEqual(stableTimestamp);
	});

	it('quarantines a reachable provider update that contradicts an already terminal order', async () => {
		const { order, transactionId } = await createProviderBackedOrder(entityTrustapTransactionTypeValues.CREATED);
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({
				status: ORDER_PHASES.COMPLETED,
				payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
				payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
			})
			.where(eq(orders.id, order.id));

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID)).status).toBe(200);

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.COMPLETED,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProvider).toMatchObject({ status: entityTrustapTransactionTypeValues.CREATED, quarantined: true });
		expect(
			(
				await db
					.select({
						conflictType: commerce_reconciliation_audit.conflict_type,
						sourceTable: commerce_reconciliation_audit.source_table,
						sourceRowId: commerce_reconciliation_audit.source_row_id,
						canonicalRowId: commerce_reconciliation_audit.canonical_row_id,
					})
					.from(commerce_reconciliation_audit)
					.where(eq(commerce_reconciliation_audit.original_reference, transactionId))
			).sort((left, right) => left.sourceTable.localeCompare(right.sourceTable)),
		).toEqual([
			{
				conflictType: 'runtime_terminal_provider_status_conflict',
				sourceTable: 'entity_trustap_transactions',
				sourceRowId: storedProvider!.id,
				canonicalRowId: order.id,
			},
			{
				conflictType: 'runtime_terminal_provider_status_conflict',
				sourceTable: 'orders',
				sourceRowId: order.id,
				canonicalRowId: storedProvider!.id,
			},
		]);
	});

	it('accepts provider progress that maps to the same terminal order phase', async () => {
		const { order, transactionId } = await createProviderBackedOrder(entityTrustapTransactionTypeValues.DELIVERED);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.COMPLETED }).where(eq(orders.id, order.id));

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.FUNDS_RELEASED)).status).toBe(200);

		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedProvider).toMatchObject({
			status: entityTrustapTransactionTypeValues.FUNDS_RELEASED,
			quarantined: false,
		});
	});

	it('rolls back the provider update when the corresponding order update fails', async () => {
		const { order, transactionId } = await createProviderBackedOrder();
		const { client, db } = getTestDatabase();
		const [orderBefore] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [providerBefore] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		await client.query(`
			CREATE FUNCTION test_fail_webhook_order_update() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				RAISE EXCEPTION 'injected webhook order update failure';
			END;
			$$;
			CREATE TRIGGER test_fail_webhook_order_update
				BEFORE UPDATE ON orders
				FOR EACH ROW EXECUTE FUNCTION test_fail_webhook_order_update();
		`);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		let response: Response;
		try {
			response = await postStatus(transactionId, entityTrustapTransactionTypeValues.PAID);
		} finally {
			consoleError.mockRestore();
			await client.query('DROP TRIGGER IF EXISTS test_fail_webhook_order_update ON orders');
			await client.query('DROP FUNCTION IF EXISTS test_fail_webhook_order_update()');
		}

		expect(response.status).toBe(500);
		expect(await db.select().from(orders).where(eq(orders.id, order.id))).toEqual([orderBefore]);
		expect(
			await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId)),
		).toEqual([providerBefore]);
	});

	it('fail-closes a complaint without lying about the current order phase', async () => {
		const { order, transactionId } = await createProviderBackedOrder();

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.COMPLAINED)).status).toBe(200);
		const { db } = getTestDatabase();
		const [afterFirstOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [afterFirstProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.COMPLAINED)).status).toBe(200);

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
		expect(storedOrder?.updated_at).toEqual(afterFirstOrder?.updated_at);
		expect(storedProvider?.updated_at).toEqual(afterFirstProvider?.updated_at);
		expect(
			await db
				.select({
					conflictType: commerce_reconciliation_audit.conflict_type,
					sourceTable: commerce_reconciliation_audit.source_table,
					sourceRowId: commerce_reconciliation_audit.source_row_id,
					originalReference: commerce_reconciliation_audit.original_reference,
				})
				.from(commerce_reconciliation_audit)
				.where(eq(commerce_reconciliation_audit.original_reference, transactionId)),
		).toEqual([
			{
				conflictType: 'runtime_complaint_reconciliation_pending',
				sourceTable: 'orders',
				sourceRowId: order.id,
				originalReference: transactionId,
			},
		]);
	});

	it('closes complaint reconciliation when the complaint period authoritatively ends', async () => {
		const { order, transactionId } = await createProviderBackedOrder();

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.COMPLAINED)).status).toBe(200);
		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED)).status).toBe(
			200,
		);

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.COMPLETED,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
		});
	});

	it('does not reopen reconciliation for an unreachable delayed complaint after funds release', async () => {
		const { order, transactionId } = await createProviderBackedOrder(entityTrustapTransactionTypeValues.FUNDS_RELEASED);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.COMPLETED }).where(eq(orders.id, order.id));

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.COMPLAINED)).status).toBe(200);

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.COMPLETED,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
		});
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.FUNDS_RELEASED);
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

	it('does not let a cron reconciliation marker authorize rejected to cancelled', async () => {
		const { order, transactionId } = await createProviderBackedOrder(entityTrustapTransactionTypeValues.REJECTED);
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({
				status: ORDER_PHASES.PAYMENT_FAILED,
				payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
				payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
			})
			.where(eq(orders.id, order.id));

		expect((await postStatus(transactionId, entityTrustapTransactionTypeValues.CANCELLED)).status).toBe(200);

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_FAILED,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.REJECTED);
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

	it('keeps subsequent unknown provider states idempotent after quarantining the transaction', async () => {
		const { order, transactionId } = await createProviderBackedOrder();

		const first = await postStatus(transactionId, 'provider_added_a_new_state');
		const second = await postStatus(transactionId, 'provider_added_another_state');

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ success: true, message: 'Quarantined transaction update ignored' });
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(storedProvider).toMatchObject({
			status: entityTrustapTransactionTypeValues.CREATED,
			quarantined: true,
		});
		expect(
			await db
				.select({ id: commerce_reconciliation_audit.id })
				.from(commerce_reconciliation_audit)
				.where(eq(commerce_reconciliation_audit.original_reference, transactionId)),
		).toHaveLength(2);
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
