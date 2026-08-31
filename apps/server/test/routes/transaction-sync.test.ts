import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
	type EntityTrustapTransactionStatus,
	entityTrustapTransactionTypeValues,
	ORDER_PHASES,
	PAYMENT_CREATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import { entityTrustapTransactions, orders, profiles, shipping_quotes } from '../../src/database/schemas/schema';
import { TransactionSyncService } from '../../src/routes/payments/transaction-sync.service';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
} from '../fixtures/commerce';
import { getTestDatabase } from '../helpers/database';
import { setTrustapTransactionStatus } from '../helpers/providers';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';

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

async function createStaleProviderBackedOrder(
	initialStatus: EntityTrustapTransactionStatus = entityTrustapTransactionTypeValues.CREATED,
) {
	const actors = await createCommerceActors();
	const item = await createItemFixture(actors);
	const order = await createOrderFixture(actors, item, {
		item_price: trustapTransactionFixture.price - 500,
		platform_charge: 500,
		payment_provider_charge: trustapTransactionFixture.charge,
		shipping_price: trustapTransactionFixture.postage_fee,
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
	return { order, transactionId: String(trustapTransactionFixture.id) };
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
