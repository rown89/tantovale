import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
	ORDER_PROPOSAL_PHASES,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import { entityTrustapTransactions, orders, orders_proposals, profiles } from '../../src/database/schemas/schema';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
} from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { getProviderRequests, setProviderScenario } from '../helpers/providers';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing worker ${name}`);
	return value;
}

async function createPayableExpiredCandidate() {
	const actors = await createCommerceActors();
	const { db } = getTestDatabase();
	await db
		.update(profiles)
		.set({ payment_provider_id: trustapTransactionFixture.buyer_id })
		.where(eq(profiles.id, actors.buyer.profile.id));
	const item = await createItemFixture(actors);
	const order = await createOrderFixture(actors, item, {
		created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000),
		item_price: trustapTransactionFixture.price,
		payment_provider_charge: trustapTransactionFixture.charge,
		payment_transaction_id: String(trustapTransactionFixture.id),
		payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
	});
	await db.insert(entityTrustapTransactions).values({
		entityId: item.id,
		sellerId: trustapTransactionFixture.seller_id,
		buyerId: trustapTransactionFixture.buyer_id,
		transactionId: String(trustapTransactionFixture.id),
		status: 'created',
		price: trustapTransactionFixture.price,
		charge: trustapTransactionFixture.charge,
		chargeSeller: trustapTransactionFixture.charge_seller,
		entityTitle: item.title,
	});
	return { actors, order };
}

describe('commerce expiry cron routes', () => {
	it('cancels a payable Trustap guest transaction before expiring the local order and removing its payment action', async () => {
		const { actors, order } = await createPayableExpiredCandidate();

		const response = await authenticatedRequest(
			'/cron/auth/expired-orders-check?key=orders-cron-test-key',
			'GET',
			actors.seller.jar,
		);

		expect(response.status).toBe(200);
		const requests = await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'));
		expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(
			`POST /api/v1/transactions/${trustapTransactionFixture.id}/cancel_with_guest_user`,
		);
		expect(requests.find(({ path }) => path.includes('/cancel_with_guest_user'))?.headers['trustap-user']).toBe(
			trustapTransactionFixture.buyer_id,
		);
		const { db } = getTestDatabase();
		const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(stored?.status).toBe(ORDER_PHASES.EXPIRED);
		const orderResponse = await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actors.buyer.jar);
		expect(await orderResponse.json()).not.toHaveProperty('payment_url');
	});

	it.each(['transaction-cancel-error', 'transaction-cancel-delay'] as const)(
		'keeps an old payable order active and blocks cancellation retry after ambiguous Trustap %s',
		async (scenario) => {
			const { actors, order } = await createPayableExpiredCandidate();
			await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), scenario);

			const startedAt = Date.now();
			const response = await authenticatedRequest(
				'/cron/auth/expired-orders-check?key=orders-cron-test-key',
				'GET',
				actors.seller.jar,
			);

			expect(response.status).toBe(200);
			if (scenario === 'transaction-cancel-delay') expect(Date.now() - startedAt).toBeLessThan(1_000);
			const body = (await response.json()) as { reconciliation_required?: Array<{ id: number }> };
			expect(body.reconciliation_required).toEqual([{ id: order.id }]);
			const { db } = getTestDatabase();
			const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(stored?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);

			await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'success');
			await authenticatedRequest('/cron/auth/expired-orders-check?key=orders-cron-test-key', 'GET', actors.seller.jar);
			const cancellationRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
				({ path }) => path.includes('/cancel_with_guest_user'),
			);
			expect(cancellationRequests).toHaveLength(1);
		},
	);
	it('fails closed for a created order without a cancellable transaction and preserves in-flight payment creation', async () => {
		const actors = await createCommerceActors();
		const old = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
		const created = await createOrderFixture(actors, await createItemFixture(actors), { created_at: old });
		const creating = await createOrderFixture(actors, await createItemFixture(actors), {
			created_at: old,
			payment_creation_state: PAYMENT_CREATION_STATES.CREATING,
		});
		const reconciliation = await createOrderFixture(actors, await createItemFixture(actors), {
			created_at: old,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});

		const response = await authenticatedRequest(
			'/cron/auth/expired-orders-check?key=orders-cron-test-key',
			'GET',
			actors.seller.jar,
		);
		expect(response.status).toBe(200);

		const { db } = getTestDatabase();
		const stored = await db.select().from(orders);
		expect(stored.find(({ id }) => id === created.id)).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(stored.find(({ id }) => id === creating.id)?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(stored.find(({ id }) => id === reconciliation.id)?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
	});

	it('does not expire a pending proposal linked to an in-flight or reconciliation order', async () => {
		const actors = await createCommerceActors();
		const old = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
		const plainItem = await createItemFixture(actors);
		const protectedItem = await createItemFixture(actors);
		const plain = await createProposalFixture(actors, plainItem, { created_at: old });
		const protectedProposal = await createProposalFixture(actors, protectedItem, { created_at: old });
		await createOrderFixture(actors, protectedItem, {
			created_at: old,
			order_proposal_id: protectedProposal.id,
			payment_creation_state: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		});

		const response = await authenticatedRequest(
			'/cron/auth/expired-proposals-check?key=proposals-cron-test-key',
			'GET',
			actors.seller.jar,
		);
		expect(response.status).toBe(200);

		const { db } = getTestDatabase();
		const [storedPlain] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, plain.id));
		const [storedProtected] = await db
			.select()
			.from(orders_proposals)
			.where(eq(orders_proposals.id, protectedProposal.id));
		expect(storedPlain?.status).toBe(ORDER_PROPOSAL_PHASES.expired);
		expect(storedProtected?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
	});
});
