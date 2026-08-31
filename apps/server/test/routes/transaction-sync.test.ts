import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

import {
	type EntityTrustapTransactionStatus,
	entityTrustapTransactionTypeValues,
	ORDER_PHASES,
	ORDER_PROPOSAL_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
	PAYMENT_INVITATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import {
	commerce_reconciliation_audit,
	entityTrustapTransactions,
	orders,
	payment_invitation_outbox,
	profiles,
	shipping_label_purchases,
	shipping_quotes,
} from '../../src/database/schemas/schema';
import { TransactionSyncService } from '../../src/routes/payments/transaction-sync.service';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
} from '../fixtures/commerce';
import { getTestDatabase } from '../helpers/database';
import { setTrustapTransactionStatus } from '../helpers/providers';
import { trustapPostageFeeFixture, trustapTransactionFixture } from '../fixtures/providers/trustap-v1';
import { itemCommerceLockScope } from '../../src/lib/item-commerce-lock';
import { app } from '../../src/app';
import type { GetTransactionStatusResponse } from '../../src/routes/payments/types';

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

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing worker ${name}`);
	return value;
}

async function acceptedMailCount(recipient: string): Promise<number> {
	/* eslint-disable-next-line turbo/no-undeclared-env-vars -- The disposable test harness supplies worker-local Mailpit. */
	const origin = process.env.MAILPIT_API_URL;
	if (!origin) throw new Error('Missing worker-local Mailpit URL');
	const url = new URL('/api/v1/search', origin);
	url.searchParams.set('query', `to:${recipient}`);
	const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
	if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
	const body = (await response.json()) as { messages: Array<{ Subject: string }> };
	return body.messages.filter(({ Subject }) => Subject === 'Tantovale - Proposal accepted').length;
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
	throw new Error(`Expected ${expected} polling request(s) to wait on blocker ${blockingProcessId}`);
}

async function postTrustapStatus(transactionId: string, status: EntityTrustapTransactionStatus): Promise<Response> {
	return app.request('/webhooks/trustap/transaction-update', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
		},
		body: JSON.stringify({ event: 'transaction_updated', transaction_id: transactionId, status }),
	});
}

async function createStaleProviderBackedOrder(
	initialStatus: EntityTrustapTransactionStatus = entityTrustapTransactionTypeValues.CREATED,
) {
	const actors = await createCommerceActors();
	const item = await createItemFixture(actors);
	const order = await createOrderFixture(actors, item, {
		item_price: trustapTransactionFixture.price - 500,
		platform_charge: 500,
		payment_provider_charge: trustapTransactionFixture.charge,
		shipping_price: trustapPostageFeeFixture,
		payment_transaction_id: String(trustapTransactionFixture.id),
		payment_creation_state: 'created',
	});
	const { db } = getTestDatabase();
	await db
		.update(profiles)
		.set({ payment_provider_id: trustapTransactionFixture.buyer_id })
		.where(eq(profiles.id, actors.buyer.profile.id));
	await db
		.update(profiles)
		.set({ payment_provider_id: trustapTransactionFixture.seller_id })
		.where(eq(profiles.id, actors.seller.profile.id));
	await db.insert(entityTrustapTransactions).values({
		entityId: item.id,
		sellerId: trustapTransactionFixture.seller_id,
		buyerId: trustapTransactionFixture.buyer_id,
		transactionId: String(trustapTransactionFixture.id),
		status: initialStatus,
		price: trustapTransactionFixture.price,
		charge: trustapTransactionFixture.charge,
		chargeSeller: trustapTransactionFixture.charge_seller,
		entityTitle: item.title,
		updated_at: new Date(0),
	});
	await setTrustapTransactionStatus(
		providerUrl('PAYMENT_PROVIDER_API_URL'),
		trustapTransactionFixture.id,
		initialStatus,
		{
			description: `${trustapTransactionFixture.description} [attempt:${order.payment_attempt_id}]`,
		},
	);
	return { actors, item, order, transactionId: String(trustapTransactionFixture.id) };
}

describe('Trustap transaction polling state mapping', () => {
	it('removes a stale PREPARING reservation and its internal quote because no Trustap POST started', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const quoteId = randomUUID();
		const attemptId = randomUUID();
		const { db } = getTestDatabase();
		await db.insert(shipping_quotes).values({
			id: quoteId,
			checkout_attempt_id: attemptId,
			item_id: item.id,
			buyer_profile_id: actors.buyer.profile.id,
			seller_profile_id: actors.seller.profile.id,
			buyer_address_id: actors.buyer.address.id,
			seller_address_id: actors.seller.address.id,
			shippo_shipment_id: `shipment-${quoteId}`,
			shippo_rate_id: `rate-${quoteId}`,
			amount: 1_200,
			currency: 'EUR',
			snapshot_fingerprint: `fingerprint-${quoteId}`,
			expires_at: new Date(Date.now() + 60_000),
		});
		const order = await createOrderFixture(actors, item, {
			payment_attempt_id: attemptId,
			payment_creation_state: PAYMENT_CREATION_STATES.PREPARING,
			updated_at: new Date(0),
		});

		const result = await new TransactionSyncService().syncTransactionStatuses();

		expect(result.results).toContainEqual(
			expect.objectContaining({ orderId: order.id, localAttemptId: attemptId, recovered: true, success: true }),
		);
		expect(await db.select().from(orders).where(eq(orders.id, order.id))).toEqual([]);
		expect(await db.select().from(shipping_quotes).where(eq(shipping_quotes.id, quoteId))).toEqual([]);
	});

	it('removes a stale PREPARING order without deleting the quote retained by its pending proposal', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const proposal = await createProposalFixture(actors, item);
		const order = await createOrderFixture(actors, item, {
			order_proposal_id: proposal.id,
			shipping_quote_id: proposal.shipping_quote_id,
			shipping_price: proposal.shipping_price!,
			payment_creation_state: PAYMENT_CREATION_STATES.PREPARING,
			updated_at: new Date(0),
		});
		const { db } = getTestDatabase();

		await new TransactionSyncService().syncTransactionStatuses();

		expect(await db.select().from(orders).where(eq(orders.id, order.id))).toEqual([]);
		expect(
			await db.select().from(shipping_quotes).where(eq(shipping_quotes.id, proposal.shipping_quote_id!)),
		).toHaveLength(1);
	});

	it('moves stale CREATING to visible manual reconciliation without retrying or releasing evidence', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const attemptId = randomUUID();
		const order = await createOrderFixture(actors, item, {
			payment_attempt_id: attemptId,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATING,
			updated_at: new Date(0),
		});
		const { db } = getTestDatabase();

		const result = await new TransactionSyncService().syncTransactionStatuses();

		const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(stored?.payment_creation_state).toBe(PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED);
		expect(stored?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(result.results).toContainEqual(
			expect.objectContaining({
				orderId: order.id,
				localAttemptId: attemptId,
				requiresManualReconciliation: true,
				success: false,
				error: expect.stringMatching(/manual reconciliation/i),
			}),
		);
	});

	it('reports an incomplete reconciliation graph instead of silently omitting it', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const order = await createOrderFixture(actors, item, {
			legacy_payment_transaction_id: String(trustapTransactionFixture.id),
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
			payment_transaction_id: null,
		});
		const { db } = getTestDatabase();
		await db.update(orders).set({ buyer_id: null, buyer_address: null }).where(eq(orders.id, order.id));

		const result = await new TransactionSyncService().syncTransactionStatuses();

		expect(result.results).toContainEqual(
			expect.objectContaining({
				orderId: order.id,
				transactionId: String(trustapTransactionFixture.id),
				requiresManualReconciliation: true,
				success: false,
				error: 'The local recovery snapshot is incomplete',
			}),
		);
	});

	it.each(mappedStatuses)('maps Trustap %s to order phase %s', async (remoteStatus, expectedOrderStatus) => {
		const { order, transactionId } = await createStaleProviderBackedOrder();
		await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, remoteStatus);

		await new TransactionSyncService().syncTransactionStatuses();

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(expectedOrderStatus);
		expect(storedProvider?.status).toBe(remoteStatus);
	});

	it('re-reads provider and order state under the item lock after polling I/O', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder();
		let releaseProvider!: () => void;
		let providerRequestStarted!: () => void;
		const providerGate = new Promise<void>((resolve) => {
			releaseProvider = resolve;
		});
		const requestStarted = new Promise<void>((resolve) => {
			providerRequestStarted = resolve;
		});
		const remotePaid = {
			...trustapTransactionFixture,
			id: transactionId,
			status: entityTrustapTransactionTypeValues.PAID,
			description: `${trustapTransactionFixture.description} [attempt:${order.payment_attempt_id}]`,
			funds_released: '',
			joined: '',
			paid: new Date().toISOString(),
		} satisfies GetTransactionStatusResponse;
		const service = new TransactionSyncService();
		Object.assign(service, {
			paymentProviderService: {
				getTransactionStatus: async () => {
					providerRequestStarted();
					await providerGate;
					return remotePaid;
				},
			},
		});

		const syncPromise = service.syncTransactionStatuses();
		await requestStarted;
		let webhookResponse: Response;
		try {
			webhookResponse = await postTrustapStatus(transactionId, entityTrustapTransactionTypeValues.JOINED);
		} finally {
			releaseProvider();
		}
		expect(webhookResponse.status).toBe(200);
		await syncPromise;

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.PAID);
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_CONFIRMED);
	});

	it('defers a terminal poll while a label intent is unresolved and applies it after purchase', async () => {
		const { item, order, transactionId } = await createStaleProviderBackedOrder(
			entityTrustapTransactionTypeValues.PAID,
		);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.PAYMENT_CONFIRMED }).where(eq(orders.id, order.id));
		await db.insert(shipping_label_purchases).values({
			order_id: order.id,
			item_id: item.id,
			purchase_attempt_id: randomUUID(),
			shippo_rate_id: 'rate-test',
		});
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		);

		const deferred = await new TransactionSyncService().syncTransactionStatuses();

		expect(deferred.results).toContainEqual({
			transactionId,
			success: false,
			error: 'Shipping label purchase transition deferred',
		});
		const [duringOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [duringProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(duringOrder?.status).toBe(ORDER_PHASES.PAYMENT_CONFIRMED);
		expect(duringProvider?.status).toBe(entityTrustapTransactionTypeValues.PAID);

		await db
			.update(shipping_label_purchases)
			.set({
				state: 'purchased',
				provider_transaction_id: 'label-transaction-test',
				provider_status: 'SUCCESS',
				label_url: 'https://labels.test/label-transaction-test.pdf',
			})
			.where(eq(shipping_label_purchases.order_id, order.id));
		const applied = await new TransactionSyncService().syncTransactionStatuses();

		expect(applied.results).toContainEqual({
			transactionId,
			oldStatus: entityTrustapTransactionTypeValues.PAID,
			newStatus: entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
			success: true,
		});
		const [terminalOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(terminalOrder?.status).toBe(ORDER_PHASES.PAYMENT_REFUNDED);
	});

	it('fail-closes a polled complaint while preserving the current order phase', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder();
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.COMPLAINED,
		);

		await new TransactionSyncService().syncTransactionStatuses();

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});
	});

	it('closes polled complaint reconciliation when the complaint period authoritatively ends', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder(
			entityTrustapTransactionTypeValues.COMPLAINED,
		);
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({
				status: ORDER_PHASES.SHIPPING_CONFIRMED,
				payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
			})
			.where(eq(orders.id, order.id));
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED,
		);

		await new TransactionSyncService().syncTransactionStatuses();

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.COMPLETED,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
		});
	});

	it('does not reopen polled reconciliation for an unreachable delayed complaint after funds release', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder(
			entityTrustapTransactionTypeValues.FUNDS_RELEASED,
		);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.COMPLETED }).where(eq(orders.id, order.id));
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.COMPLAINED,
		);

		await new TransactionSyncService().syncTransactionStatuses();

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

	it('polls a stale complaint before draining its pending payment invitation', async () => {
		const { actors, item, order, transactionId } = await createStaleProviderBackedOrder();
		const proposal = await createProposalFixture(actors, item, { status: ORDER_PROPOSAL_PHASES.accepted });
		const { db } = getTestDatabase();
		await db.update(orders).set({ order_proposal_id: proposal.id }).where(eq(orders.id, order.id));
		await db.insert(payment_invitation_outbox).values({
			order_id: order.id,
			transaction_id: transactionId,
			recipient_email: actors.buyer.user.email,
			merchant_username: actors.seller.user.username,
			item_name: item.title,
		});
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.COMPLAINED,
		);

		await new TransactionSyncService().syncTransactionStatuses();

		const [intent] = await db
			.select()
			.from(payment_invitation_outbox)
			.where(eq(payment_invitation_outbox.order_id, order.id));
		expect(intent).toMatchObject({ state: PAYMENT_INVITATION_STATES.PENDING, attempt_count: 0 });
		expect(await acceptedMailCount(actors.buyer.user.email)).toBe(0);
	});

	it.each([
		['complaint then refund', true],
		['missed complaint then refund', false],
	] as const)('accepts a polled authoritative refund after delivery (%s)', async (_label, sendComplaint) => {
		const { order, transactionId } = await createStaleProviderBackedOrder(entityTrustapTransactionTypeValues.DELIVERED);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.COMPLETED }).where(eq(orders.id, order.id));
		if (sendComplaint) {
			await setTrustapTransactionStatus(
				providerUrl('PAYMENT_PROVIDER_API_URL'),
				transactionId,
				entityTrustapTransactionTypeValues.COMPLAINED,
			);
			await new TransactionSyncService().syncTransactionStatuses();
			await db
				.update(entityTrustapTransactions)
				.set({ updated_at: new Date(0) })
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
		}
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		);

		await new TransactionSyncService().syncTransactionStatuses();

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

	it.each(['item', 'identity', 'amount'] as const)(
		'permanently quarantines a polled %s correlation mismatch',
		async (mismatch) => {
			const { order, transactionId } = await createStaleProviderBackedOrder();
			const { db } = getTestDatabase();
			if (mismatch === 'item') {
				const actors = await createCommerceActors();
				const otherItem = await createItemFixture(actors);
				await db
					.update(entityTrustapTransactions)
					.set({ entityId: otherItem.id })
					.where(eq(entityTrustapTransactions.transactionId, transactionId));
			} else if (mismatch === 'identity') {
				await db
					.update(entityTrustapTransactions)
					.set({ buyerId: 'wrong-local-provider-user' })
					.where(eq(entityTrustapTransactions.transactionId, transactionId));
			} else {
				await db
					.update(entityTrustapTransactions)
					.set({ price: trustapTransactionFixture.price + 1 })
					.where(eq(entityTrustapTransactions.transactionId, transactionId));
			}

			const first = await new TransactionSyncService().syncTransactionStatuses();
			const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
			const [storedProvider] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
			const audits = await db
				.select()
				.from(commerce_reconciliation_audit)
				.where(eq(commerce_reconciliation_audit.original_reference, transactionId));
			expect(first.failedTransactions).toBeGreaterThanOrEqual(1);
			expect(storedOrder?.payment_creation_state).toBe(PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED);
			expect(storedProvider?.quarantined).toBe(true);
			expect(audits.map(({ source_table }) => source_table).sort()).toEqual(['entity_trustap_transactions', 'orders']);

			await new TransactionSyncService().syncTransactionStatuses();
			const repeatedAudits = await db
				.select()
				.from(commerce_reconciliation_audit)
				.where(eq(commerce_reconciliation_audit.original_reference, transactionId));
			expect(repeatedAudits).toHaveLength(2);
		},
	);

	it('quarantines a polling mismatch only after waiting on the exact shared item lock', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder();
		if (order.item_id === null) throw new Error('Expected order item');
		const { db, client } = getTestDatabase();
		await db
			.update(entityTrustapTransactions)
			.set({ price: trustapTransactionFixture.price + 1 })
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		const blocker = await client.connect();
		try {
			await blocker.query('BEGIN');
			const blockerPid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
			if (!blockerPid) throw new Error('Missing blocker PID');
			await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_database() || $1), $2)', [
				itemCommerceLockScope,
				order.item_id,
			]);

			const syncPromise = new TransactionSyncService().syncTransactionStatuses();
			await waitForBlockedRequests(blocker, blockerPid, 1);
			const [whileBlocked] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
			expect(whileBlocked?.quarantined).toBe(false);
			await blocker.query('COMMIT');
			await syncPromise;

			const [storedProvider] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
			expect(storedProvider?.quarantined).toBe(true);
		} finally {
			await blocker.query('ROLLBACK').catch(() => undefined);
			blocker.release();
		}
	});

	it('ignores stale provider replays and active regressions', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder(entityTrustapTransactionTypeValues.DELIVERED);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.SHIPPING_CONFIRMED }).where(eq(orders.id, order.id));
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.PAID,
		);

		await new TransactionSyncService().syncTransactionStatuses();

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.SHIPPING_CONFIRMED);
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.DELIVERED);
	});

	it('records payment_refunded after cancelled_with_payment without reopening the terminal order', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder(
			entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT,
		);
		const { db } = getTestDatabase();
		await db.update(orders).set({ status: ORDER_PHASES.PAYMENT_REFUNDED }).where(eq(orders.id, order.id));
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		);

		await new TransactionSyncService().syncTransactionStatuses();

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_REFUNDED);
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.PAYMENT_REFUNDED);
	});

	it('allows a fail-closed complained recovery to become authoritatively refunded later', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder(
			entityTrustapTransactionTypeValues.COMPLAINED,
		);
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({
				status: ORDER_PHASES.SHIPPING_CONFIRMED,
				payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
				payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
			})
			.where(eq(orders.id, order.id));
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		);

		await new TransactionSyncService().syncTransactionStatuses();

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.PAYMENT_REFUNDED);
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_REFUNDED,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
		});
	});

	it.each([
		entityTrustapTransactionTypeValues.REJECTED,
		entityTrustapTransactionTypeValues.CANCELLED,
		entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT,
		entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
	])('resolves a same-status polled %s cancellation reconciliation marker', async (status) => {
		const { order, transactionId } = await createStaleProviderBackedOrder(status);
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
		await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, status);

		await new TransactionSyncService().syncTransactionStatuses();

		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(storedOrder?.payment_cancellation_state).toBe(PAYMENT_CANCELLATION_STATES.CANCELLED);
	});

	it('reports an unknown provider state without writing it into PostgreSQL', async () => {
		const { order, transactionId } = await createStaleProviderBackedOrder();
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			transactionId,
			'provider_added_a_new_state',
		);

		const result = await new TransactionSyncService().syncTransactionStatuses();

		expect(result.failedTransactions).toBe(1);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(storedProvider?.status).toBe(entityTrustapTransactionTypeValues.CREATED);
	});
});
