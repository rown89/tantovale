import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	entityTrustapTransactionTypeValues,
	ORDER_PROPOSAL_PHASES,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
	PAYMENT_CREATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import {
	commerce_reconciliation_audit,
	entityTrustapTransactions,
	orders,
	orders_proposals,
	profiles,
} from '../../src/database/schemas/schema';
import {
	createCommerceActors,
	createItemFixture,
	createOrderFixture,
	createProposalFixture,
} from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { getProviderRequests, setProviderScenario, setTrustapTransactionStatus } from '../helpers/providers';
import { trustapPostageFeeFixture, trustapTransactionFixture } from '../fixtures/providers/trustap-v1';
import { app } from '../../src/app';
import { environment } from '../../src/utils/constants';
import { PaymentProviderService } from '../../src/routes/payments/payment-provider.service';

function providerUrl(name: 'PAYMENT_PROVIDER_API_URL'): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing worker ${name}`);
	return value;
}

const cronRoutes = [
	['expired-orders-check', 'orders-cron-test-key'],
	['expired-proposals-check', 'proposals-cron-test-key'],
	['sync-transactions', 'transactions-cron-test-key'],
] as const;

describe('scheduled job authentication', () => {
	it.each(cronRoutes)('allows %s with its exact job key and no user cookie', async (route, key) => {
		const response = await app.request(`/cron/auth/${route}?key=${key}`);

		expect(response.status).toBe(200);
	});

	it.each(cronRoutes)('rejects %s when its job key is missing', async (route) => {
		const response = await app.request(`/cron/auth/${route}`);

		expect(response.status).toBe(401);
	});

	it.each(cronRoutes)("rejects %s when given another job's valid key", async (route, key) => {
		const otherKey = cronRoutes.find((candidate) => candidate[1] !== key)?.[1];
		if (!otherKey) throw new Error('Cron test matrix requires distinct route keys');

		const response = await app.request(`/cron/auth/${route}?key=${otherKey}`);

		expect(response.status).toBe(401);
	});

	it.each(cronRoutes)('rejects %s when the key query parameter is duplicated in either order', async (route, key) => {
		for (const query of [`key=${key}&key=wrong-job-key`, `key=wrong-job-key&key=${key}`]) {
			const response = await app.request(`/cron/auth/${route}?${query}`);

			expect(response.status).toBe(401);
		}
	});

	it.each(cronRoutes)('rejects %s when its job key is wrong even with a valid user cookie', async (route) => {
		const actors = await createCommerceActors();
		const response = await authenticatedRequest(`/cron/auth/${route}?key=wrong-job-key`, 'GET', actors.seller.jar);

		expect(response.status).toBe(401);
	});

	it('does not bypass cookie authentication for another path merely containing auth', async () => {
		const response = await app.request('/cron/authentic');

		expect(response.status).toBe(401);
	});
});

const fixedNow = new Date('2031-04-05T12:00:00.000Z');
const hourInMilliseconds = 60 * 60 * 1_000;

function useFixedUtcClock(): void {
	vi.useFakeTimers({ now: fixedNow, toFake: ['Date'] });
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function createPayableExpiredCandidate(
	createdAt = new Date(Date.now() - 7 * 24 * hourInMilliseconds),
	options: { configureRemote?: boolean; transactionId?: number } = {},
) {
	const transactionId = options.transactionId ?? trustapTransactionFixture.id;
	const actors = await createCommerceActors();
	const { db } = getTestDatabase();
	await db
		.update(profiles)
		.set({ payment_provider_id: trustapTransactionFixture.buyer_id })
		.where(eq(profiles.id, actors.buyer.profile.id));
	await db
		.update(profiles)
		.set({ payment_provider_id: trustapTransactionFixture.seller_id })
		.where(eq(profiles.id, actors.seller.profile.id));
	const item = await createItemFixture(actors);
	const order = await createOrderFixture(actors, item, {
		created_at: createdAt,
		item_price: trustapTransactionFixture.price - 500,
		platform_charge: 500,
		payment_provider_charge: trustapTransactionFixture.charge,
		payment_transaction_id: String(transactionId),
		payment_creation_state: PAYMENT_CREATION_STATES.CREATED,
	});
	await db.insert(entityTrustapTransactions).values({
		entityId: item.id,
		sellerId: trustapTransactionFixture.seller_id,
		buyerId: trustapTransactionFixture.buyer_id,
		transactionId: String(transactionId),
		status: 'created',
		price: trustapTransactionFixture.price,
		charge: trustapTransactionFixture.charge,
		chargeSeller: trustapTransactionFixture.charge_seller,
		entityTitle: item.title,
	});
	if (options.configureRemote !== false) {
		await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), transactionId, 'created', {
			description: `Transaction for ${item.title} - (Buy Now, ref ${order.payment_attempt_id})`,
		});
	}
	return { actors, item, order };
}

async function createStaleProviderBackedOrder(updatedAt = new Date(0)) {
	const actors = await createCommerceActors();
	const item = await createItemFixture(actors);
	const { db } = getTestDatabase();
	await db
		.update(profiles)
		.set({ payment_provider_id: trustapTransactionFixture.buyer_id })
		.where(eq(profiles.id, actors.buyer.profile.id));
	await db
		.update(profiles)
		.set({ payment_provider_id: trustapTransactionFixture.seller_id })
		.where(eq(profiles.id, actors.seller.profile.id));
	const order = await createOrderFixture(actors, item, {
		item_price: trustapTransactionFixture.price - 500,
		platform_charge: 500,
		payment_provider_charge: trustapTransactionFixture.charge,
		shipping_price: trustapPostageFeeFixture,
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
		updated_at: updatedAt,
	});
	await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), trustapTransactionFixture.id, 'created', {
		description: `${trustapTransactionFixture.description} [attempt:${order.payment_attempt_id}]`,
	});
	return { actors, order };
}

describe('commerce expiry cron routes', () => {
	it('reports every outcome class honestly for a mixed expiry batch', async () => {
		const expired = await createPayableExpiredCandidate(undefined, {
			configureRemote: false,
			transactionId: 9_200_001,
		});
		const reconciliation = await createPayableExpiredCandidate(undefined, {
			configureRemote: false,
			transactionId: 9_200_002,
		});
		const superseded = await createPayableExpiredCandidate(undefined, {
			configureRemote: false,
			transactionId: 9_200_003,
		});
		vi.spyOn(PaymentProviderService.prototype, 'cancelGuestTransaction').mockImplementation(async (snapshot) => {
			if (snapshot.transaction_id === '9200002') throw new Error('Simulated ambiguous cancellation outcome');
			if (snapshot.transaction_id === '9200003') {
				const webhookResponse = await app.request('/webhooks/trustap/transaction-update', {
					method: 'POST',
					headers: {
						Authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						event: 'transaction_updated',
						transaction_id: snapshot.transaction_id,
						status: entityTrustapTransactionTypeValues.PAID,
					}),
				});
				expect(webhookResponse.status).toBe(200);
			}
			return trustapTransactionFixture as never;
		});

		const response = await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			orders: [{ id: expired.order.id }],
			reconciliation_required: [{ id: reconciliation.order.id }],
			cancellation_superseded: [{ id: superseded.order.id }],
			message: 'Order expiry processing completed',
		});
	});

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
		expect(stored?.payment_cancellation_state).toBe(PAYMENT_CANCELLATION_STATES.CANCELLED);
		const [providerTransaction] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		expect(providerTransaction?.status).toBe('cancelled');
		const orderResponse = await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actors.buyer.jar);
		expect(await orderResponse.json()).not.toHaveProperty('payment_url');

		await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');
		const repeatedCancellationRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ path }) => path.includes('/cancel_with_guest_user'),
		);
		expect(repeatedCancellationRequests).toHaveLength(1);
	});

	it.each([
		['strictly before', -1, ORDER_PHASES.EXPIRED, 1],
		['exactly at', 0, ORDER_PHASES.PAYMENT_PENDING, 0],
		['strictly after', 1, ORDER_PHASES.PAYMENT_PENDING, 0],
	] as const)(
		'uses a strict payment cutoff for an order created %s the boundary',
		async (_position, deltaMilliseconds, expectedStatus, expectedCancelCalls) => {
			useFixedUtcClock();
			const cutoff = fixedNow.getTime() - 48 * hourInMilliseconds;
			const { order } = await createPayableExpiredCandidate(new Date(cutoff + deltaMilliseconds));

			const response = await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

			expect(response.status).toBe(200);
			const { db } = getTestDatabase();
			const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(stored?.status).toBe(expectedStatus);
			const cancellations = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(({ path }) =>
				path.includes('/cancel_with_guest_user'),
			);
			expect(cancellations).toHaveLength(expectedCancelCalls);
		},
	);

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

	it.each([
		['strictly stale', -1, PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED],
		['exactly at the lease', 0, PAYMENT_CANCELLATION_STATES.CANCELLING],
		['still fresh', 1, PAYMENT_CANCELLATION_STATES.CANCELLING],
	] as const)(
		'handles a %s CANCELLING lease boundary without another provider call',
		async (_case, deltaMilliseconds, expectedState) => {
			useFixedUtcClock();
			const { order } = await createPayableExpiredCandidate(new Date(fixedNow.getTime() - 49 * hourInMilliseconds));
			const leaseMilliseconds = environment.PROVIDER_REQUEST_TIMEOUT_MS * 2;
			const { db } = getTestDatabase();
			await db
				.update(orders)
				.set({
					payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLING,
					updated_at: new Date(fixedNow.getTime() - leaseMilliseconds + deltaMilliseconds),
				})
				.where(eq(orders.id, order.id));

			const response = await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

			expect(response.status).toBe(200);
			const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(stored?.payment_cancellation_state).toBe(expectedState);
			const cancellations = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(({ path }) =>
				path.includes('/cancel_with_guest_user'),
			);
			expect(cancellations).toHaveLength(0);
		},
	);

	it('lets the sync fallback resolve a stale cancellation claim from authoritative remote state', async () => {
		useFixedUtcClock();
		const { item, order } = await createPayableExpiredCandidate(new Date(fixedNow.getTime() - 49 * hourInMilliseconds));
		const { db } = getTestDatabase();
		await db
			.update(orders)
			.set({
				payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLING,
				updated_at: new Date(fixedNow.getTime() - environment.PROVIDER_REQUEST_TIMEOUT_MS * 2 - 1),
			})
			.where(eq(orders.id, order.id));
		await db
			.update(entityTrustapTransactions)
			.set({ updated_at: new Date(fixedNow.getTime() - hourInMilliseconds - 1) })
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			trustapTransactionFixture.id,
			'cancelled',
			{
				description: `Transaction for ${item.title} - (Buy Now, ref ${order.payment_attempt_id})`,
			},
		);

		await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');
		const [afterRecovery] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(afterRecovery?.payment_cancellation_state).toBe(PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED);

		const syncResponse = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');

		expect(syncResponse.status).toBe(200);
		const [afterSync] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(afterSync).toMatchObject({
			status: ORDER_PHASES.EXPIRED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
		});
	});

	it('normalizes an authoritative webhook cancellation winner to the cron expiry outcome', async () => {
		const { actors, order } = await createPayableExpiredCandidate();
		let releaseProvider!: () => void;
		const providerReleased = new Promise<void>((resolve) => {
			releaseProvider = resolve;
		});
		let providerStarted!: () => void;
		const providerWasCalled = new Promise<void>((resolve) => {
			providerStarted = resolve;
		});
		vi.spyOn(PaymentProviderService.prototype, 'cancelGuestTransaction').mockImplementation(async () => {
			providerStarted();
			await providerReleased;
			return trustapTransactionFixture as never;
		});

		const cronResponsePromise = app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');
		await providerWasCalled;
		const webhookResponse = await app.request('/webhooks/trustap/transaction-update', {
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				event: 'transaction_updated',
				transaction_id: trustapTransactionFixture.id,
				status: 'cancelled',
			}),
		});
		expect(webhookResponse.status).toBe(200);
		releaseProvider();
		const cronResponse = await cronResponsePromise;
		expect(cronResponse.status).toBe(200);
		expect(await cronResponse.json()).toMatchObject({ orders: [{ id: order.id }], message: 'Orders expired' });

		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.EXPIRED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
		});
		expect(storedProvider?.status).toBe('cancelled');
		const buyerOrder = await authenticatedRequest(`/orders/auth/${order.id}`, 'GET', actors.buyer.jar);
		expect(buyerOrder.status).toBe(200);
	});

	it.each([
		{
			providerStatus: entityTrustapTransactionTypeValues.PAID,
			orderStatus: ORDER_PHASES.PAYMENT_CONFIRMED,
			cancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.REJECTED,
			orderStatus: ORDER_PHASES.PAYMENT_FAILED,
			cancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.TRACKED,
			orderStatus: ORDER_PHASES.SHIPPING_CONFIRMED,
			cancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT,
			orderStatus: ORDER_PHASES.PAYMENT_REFUNDED,
			cancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.DELIVERED,
			orderStatus: ORDER_PHASES.COMPLETED,
			cancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
			orderStatus: ORDER_PHASES.PAYMENT_REFUNDED,
			cancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.COMPLAINED,
			orderStatus: ORDER_PHASES.PAYMENT_PENDING,
			cancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			creationState: PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED,
			orderStatus: ORDER_PHASES.COMPLETED,
			cancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
		{
			providerStatus: entityTrustapTransactionTypeValues.FUNDS_RELEASED,
			orderStatus: ORDER_PHASES.COMPLETED,
			cancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			creationState: PAYMENT_CREATION_STATES.CREATED,
		},
	] as const)(
		'clears a superseded cancellation attempt when $providerStatus wins before cron finalize',
		async ({ providerStatus, orderStatus, cancellationState, creationState }) => {
			const { order } = await createPayableExpiredCandidate();
			let releaseProvider!: () => void;
			const providerReleased = new Promise<void>((resolve) => {
				releaseProvider = resolve;
			});
			let providerStarted!: () => void;
			const providerWasCalled = new Promise<void>((resolve) => {
				providerStarted = resolve;
			});
			vi.spyOn(PaymentProviderService.prototype, 'cancelGuestTransaction').mockImplementation(async () => {
				providerStarted();
				await providerReleased;
				if (providerStatus === entityTrustapTransactionTypeValues.PAID) {
					throw new Error('Simulated ambiguous cancellation response after paid webhook');
				}
				return trustapTransactionFixture as never;
			});

			const cronResponsePromise = app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');
			await providerWasCalled;
			const webhookResponse = await app.request('/webhooks/trustap/transaction-update', {
				method: 'POST',
				headers: {
					Authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					event: 'transaction_updated',
					transaction_id: trustapTransactionFixture.id,
					status: providerStatus,
				}),
			});
			expect(webhookResponse.status).toBe(200);
			releaseProvider();
			const cronResponse = await cronResponsePromise;
			expect(cronResponse.status).toBe(200);
			expect(await cronResponse.json()).toMatchObject({ cancellation_superseded: [{ id: order.id }] });

			const { db } = getTestDatabase();
			const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
			const [storedProvider] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
			expect(storedOrder).toMatchObject({
				status: orderStatus,
				payment_cancellation_state: cancellationState,
				payment_creation_state: creationState,
			});
			expect(storedProvider?.status).toBe(providerStatus);
		},
	);
	it('fails closed for a created order without a cancellable transaction and preserves in-flight payment creation', async () => {
		const actors = await createCommerceActors();
		const { db } = getTestDatabase();
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
		const cancelling = await createOrderFixture(actors, await createItemFixture(actors), {
			created_at: old,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLING,
		});

		await db.update(profiles).set({ payment_provider_id: null }).where(eq(profiles.id, actors.buyer.profile.id));

		const response = await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');
		expect(response.status).toBe(200);

		const stored = await db.select().from(orders);
		expect(stored.find(({ id }) => id === created.id)).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(stored.find(({ id }) => id === creating.id)?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(stored.find(({ id }) => id === reconciliation.id)?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(stored.find(({ id }) => id === cancelling.id)).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLING,
		});
		const cancellationRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ path }) => path.includes('/cancel_with_guest_user'),
		);
		expect(cancellationRequests).toHaveLength(0);
	});

	it('requires the persisted provider transaction graph before attempting remote cancellation', async () => {
		const { order } = await createPayableExpiredCandidate();
		const { db } = getTestDatabase();
		await db
			.delete(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));

		const response = await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

		expect(response.status).toBe(200);
		const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(stored).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		const cancellationRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
			({ path }) => path.includes('/cancel_with_guest_user'),
		);
		expect(cancellationRequests).toHaveLength(0);
	});

	it.each(['seller identity', 'transaction amount', 'profile identity'] as const)(
		'quarantines cancellation evidence when the local %s correlation is inconsistent',
		async (mismatch) => {
			const { actors, order } = await createPayableExpiredCandidate();
			const { db } = getTestDatabase();
			const transactionId = String(trustapTransactionFixture.id);
			if (mismatch === 'profile identity') {
				await db
					.update(profiles)
					.set({ payment_provider_id: 'unrelated-profile-seller' })
					.where(eq(profiles.id, actors.seller.profile.id));
			} else {
				await db
					.update(entityTrustapTransactions)
					.set(
						mismatch === 'seller identity'
							? { sellerId: 'unrelated-provider-seller' }
							: { price: trustapTransactionFixture.price + 1 },
					)
					.where(eq(entityTrustapTransactions.transactionId, transactionId));
			}

			await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

			const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(stored).toMatchObject({
				status: ORDER_PHASES.PAYMENT_PENDING,
				payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
			});
			const cancellationRequests = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(
				({ path }) => path.includes('/cancel_with_guest_user'),
			);
			expect(cancellationRequests).toHaveLength(0);
			const [storedProvider] = await db
				.select()
				.from(entityTrustapTransactions)
				.where(eq(entityTrustapTransactions.transactionId, transactionId));
			expect(storedProvider?.quarantined).toBe(true);
			expect(
				await db
					.select({ conflictType: commerce_reconciliation_audit.conflict_type })
					.from(commerce_reconciliation_audit)
					.where(eq(commerce_reconciliation_audit.original_reference, transactionId)),
			).toContainEqual({ conflictType: 'runtime_cron_cancellation_correlation_mismatch' });
		},
	);

	it('quarantines immutable graph mismatch so a later status-only webhook cannot erase reconciliation', async () => {
		const { order } = await createPayableExpiredCandidate();
		const { db } = getTestDatabase();
		const transactionId = String(trustapTransactionFixture.id);
		await db
			.update(entityTrustapTransactions)
			.set({ price: trustapTransactionFixture.price + 1 })
			.where(eq(entityTrustapTransactions.transactionId, transactionId));

		const cronResponse = await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

		expect(cronResponse.status).toBe(200);
		const cronBody = (await cronResponse.json()) as { reconciliation_required: Array<{ id: number }> };
		expect(cronBody.reconciliation_required).toEqual([{ id: order.id }]);
		expect(
			(await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(({ path }) =>
				path.includes('/cancel_with_guest_user'),
			),
		).toEqual([]);
		const [quarantinedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(quarantinedProvider).toMatchObject({ quarantined: true, status: 'created' });
		expect(
			await db
				.select({ conflictType: commerce_reconciliation_audit.conflict_type })
				.from(commerce_reconciliation_audit)
				.where(eq(commerce_reconciliation_audit.original_reference, transactionId)),
		).toContainEqual({ conflictType: 'runtime_cron_cancellation_correlation_mismatch' });

		const webhookResponse = await app.request('/webhooks/trustap/transaction-update', {
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from('trustap-webhook-test-user:trustap-webhook-test-secret').toString('base64')}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				event: 'transaction_updated',
				transaction_id: transactionId,
				status: entityTrustapTransactionTypeValues.PAID,
			}),
		});

		expect(webhookResponse.status).toBe(200);
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, transactionId));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProvider).toMatchObject({ quarantined: true, status: 'created' });
	});

	it('marks the order for reconciliation when the provider cancellation response breaks the durable snapshot', async () => {
		const { order } = await createPayableExpiredCandidate();
		await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'transaction-cancel-description-mismatch');

		const response = await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

		expect(response.status).toBe(200);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		expect(storedOrder).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProvider?.status).toBe('created');
	});

	it.each(['created', 'joined'] as const)('cancels only a %s provider source state', async (sourceStatus) => {
		const { order } = await createPayableExpiredCandidate();
		const { db } = getTestDatabase();
		await db
			.update(entityTrustapTransactions)
			.set({ status: sourceStatus })
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		await setTrustapTransactionStatus(
			providerUrl('PAYMENT_PROVIDER_API_URL'),
			trustapTransactionFixture.id,
			sourceStatus,
		);

		await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

		const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
		expect(stored).toMatchObject({
			status: ORDER_PHASES.EXPIRED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
		});
	});

	it.each([
		entityTrustapTransactionTypeValues.PAID,
		entityTrustapTransactionTypeValues.REJECTED,
		entityTrustapTransactionTypeValues.CANCELLED,
		entityTrustapTransactionTypeValues.TRACKED,
		entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT,
		entityTrustapTransactionTypeValues.DELIVERED,
		entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		entityTrustapTransactionTypeValues.COMPLAINED,
		entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED,
		entityTrustapTransactionTypeValues.FUNDS_RELEASED,
	] as const)('never calls cancel from the non-cancellable local provider state %s', async (sourceStatus) => {
		const { order } = await createPayableExpiredCandidate();
		const { db } = getTestDatabase();
		await db
			.update(entityTrustapTransactions)
			.set({ status: sourceStatus })
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));

		await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

		const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		expect(stored).toMatchObject({
			status: ORDER_PHASES.PAYMENT_PENDING,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
		});
		expect(storedProvider?.quarantined).toBe(false);
		const cancellations = (await getProviderRequests(providerUrl('PAYMENT_PROVIDER_API_URL'))).filter(({ path }) =>
			path.includes('/cancel_with_guest_user'),
		);
		expect(cancellations).toHaveLength(0);
	});

	it('does not regress a terminal order even when it is older than the payment cutoff', async () => {
		useFixedUtcClock();
		const actors = await createCommerceActors();
		const terminalOrder = await createOrderFixture(actors, await createItemFixture(actors), {
			created_at: new Date(fixedNow.getTime() - 49 * hourInMilliseconds),
			status: ORDER_PHASES.CANCELLED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
		});
		const { db } = getTestDatabase();
		const originalUpdatedAt = terminalOrder.updated_at;

		await app.request('/cron/auth/expired-orders-check?key=orders-cron-test-key');

		const [stored] = await db.select().from(orders).where(eq(orders.id, terminalOrder.id));
		expect(stored).toMatchObject({
			status: ORDER_PHASES.CANCELLED,
			payment_cancellation_state: PAYMENT_CANCELLATION_STATES.CANCELLED,
		});
		expect(stored?.updated_at).toEqual(originalUpdatedAt);
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

	it('expires only pending proposals strictly older than the fixed UTC cutoff and is idempotent', async () => {
		useFixedUtcClock();
		const actors = await createCommerceActors();
		const cutoff = fixedNow.getTime() - 96 * hourInMilliseconds;
		const before = await createProposalFixture(actors, await createItemFixture(actors), {
			created_at: new Date(cutoff - 1),
		});
		const exact = await createProposalFixture(actors, await createItemFixture(actors), {
			created_at: new Date(cutoff),
		});
		const after = await createProposalFixture(actors, await createItemFixture(actors), {
			created_at: new Date(cutoff + 1),
		});
		const accepted = await createProposalFixture(actors, await createItemFixture(actors), {
			created_at: new Date(cutoff - 1),
			status: ORDER_PROPOSAL_PHASES.accepted,
		});

		const first = await app.request('/cron/auth/expired-proposals-check?key=proposals-cron-test-key');
		expect(await first.json()).toMatchObject({ proposals: [{ id: before.id }], message: 'Proposals expired' });
		const { db } = getTestDatabase();
		const afterFirstRun = await db.select().from(orders_proposals);
		expect(afterFirstRun.find(({ id }) => id === before.id)?.status).toBe(ORDER_PROPOSAL_PHASES.expired);
		expect(afterFirstRun.find(({ id }) => id === exact.id)?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
		expect(afterFirstRun.find(({ id }) => id === after.id)?.status).toBe(ORDER_PROPOSAL_PHASES.pending);
		expect(afterFirstRun.find(({ id }) => id === accepted.id)?.status).toBe(ORDER_PROPOSAL_PHASES.accepted);
		const expiredUpdatedAt = afterFirstRun.find(({ id }) => id === before.id)?.updated_at;

		const second = await app.request('/cron/auth/expired-proposals-check?key=proposals-cron-test-key');
		expect(await second.json()).toEqual({ message: 'No proposals to cancel', status: 200 });
		const [afterSecondRun] = await db.select().from(orders_proposals).where(eq(orders_proposals.id, before.id));
		expect(afterSecondRun?.updated_at).toEqual(expiredUpdatedAt);
	});

	it('preserves pending proposals while every in-flight payment creation state is unresolved', async () => {
		useFixedUtcClock();
		const actors = await createCommerceActors();
		const old = new Date(fixedNow.getTime() - 97 * hourInMilliseconds);
		const protectedProposals = [];
		for (const paymentCreationState of [
			PAYMENT_CREATION_STATES.PREPARING,
			PAYMENT_CREATION_STATES.CREATING,
			PAYMENT_CREATION_STATES.RECONCILIATION_REQUIRED,
		]) {
			const item = await createItemFixture(actors);
			const proposal = await createProposalFixture(actors, item, { created_at: old });
			await createOrderFixture(actors, item, {
				created_at: old,
				order_proposal_id: proposal.id,
				payment_creation_state: paymentCreationState,
			});
			protectedProposals.push(proposal);
		}

		await app.request('/cron/auth/expired-proposals-check?key=proposals-cron-test-key');

		const { db } = getTestDatabase();
		const stored = await db.select().from(orders_proposals);
		expect(protectedProposals.map(({ id }) => stored.find((proposal) => proposal.id === id)?.status)).toEqual([
			ORDER_PROPOSAL_PHASES.pending,
			ORDER_PROPOSAL_PHASES.pending,
			ORDER_PROPOSAL_PHASES.pending,
		]);
	});
});

describe('transaction sync cron route', () => {
	it.each([
		['strictly before', -1, 1, ORDER_PHASES.PAYMENT_CONFIRMED],
		['exactly at', 0, 0, ORDER_PHASES.PAYMENT_PENDING],
		['strictly after', 1, 0, ORDER_PHASES.PAYMENT_PENDING],
	] as const)(
		'synchronizes provider rows %s the strict one-hour cutoff',
		async (_case, deltaMilliseconds, expectedTotal, expectedOrderStatus) => {
			useFixedUtcClock();
			const cutoff = fixedNow.getTime() - hourInMilliseconds;
			const { order } = await createStaleProviderBackedOrder(new Date(cutoff + deltaMilliseconds));
			await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), trustapTransactionFixture.id, 'paid', {
				description: `${trustapTransactionFixture.description} [attempt:${order.payment_attempt_id}]`,
			});

			const response = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ totalTransactions: expectedTotal });
			const { db } = getTestDatabase();
			const [stored] = await db.select().from(orders).where(eq(orders.id, order.id));
			expect(stored?.status).toBe(expectedOrderStatus);
		},
	);

	it('reports and applies a changed Trustap transaction, then skips the fresh row on repetition', async () => {
		const { order } = await createStaleProviderBackedOrder();
		await setTrustapTransactionStatus(providerUrl('PAYMENT_PROVIDER_API_URL'), trustapTransactionFixture.id, 'paid', {
			description: `${trustapTransactionFixture.description} [attempt:${order.payment_attempt_id}]`,
		});

		const first = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');
		expect(first.status).toBe(200);
		expect(await first.json()).toEqual({
			totalTransactions: 1,
			syncedTransactions: 1,
			failedTransactions: 0,
			results: [
				{
					transactionId: String(trustapTransactionFixture.id),
					oldStatus: 'created',
					newStatus: 'paid',
					success: true,
				},
			],
		});
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_CONFIRMED);
		expect(storedProvider?.status).toBe('paid');

		const second = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');
		expect(await second.json()).toEqual({
			totalTransactions: 0,
			syncedTransactions: 0,
			failedTransactions: 0,
			results: [],
		});
	});

	it('reports an unchanged Trustap transaction deterministically without rewriting it', async () => {
		await createStaleProviderBackedOrder();
		const { db } = getTestDatabase();
		const [before] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));

		const first = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');
		const second = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');

		const expected = { totalTransactions: 1, syncedTransactions: 0, failedTransactions: 0, results: [] };
		expect(await first.json()).toEqual(expected);
		expect(await second.json()).toEqual(expected);
		const [after] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		expect(after?.updated_at).toEqual(before?.updated_at);
	});

	it('reports provider failures without changing either side of the local transaction graph', async () => {
		const { order } = await createStaleProviderBackedOrder();
		await setProviderScenario(providerUrl('PAYMENT_PROVIDER_API_URL'), 'transaction-fetch-malformed-json');

		const first = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');
		const firstBody = (await first.json()) as {
			totalTransactions: number;
			syncedTransactions: number;
			failedTransactions: number;
			results: Array<{ transactionId: string; success: boolean }>;
		};
		expect(first.status).toBe(200);
		expect(firstBody).toMatchObject({ totalTransactions: 1, syncedTransactions: 0, failedTransactions: 1 });
		expect(firstBody.results).toEqual([
			expect.objectContaining({ transactionId: String(trustapTransactionFixture.id), success: false }),
		]);
		const { db } = getTestDatabase();
		const [storedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
		const [storedProvider] = await db
			.select()
			.from(entityTrustapTransactions)
			.where(eq(entityTrustapTransactions.transactionId, String(trustapTransactionFixture.id)));
		expect(storedOrder?.status).toBe(ORDER_PHASES.PAYMENT_PENDING);
		expect(storedProvider?.status).toBe('created');

		const second = await app.request('/cron/auth/sync-transactions?key=transactions-cron-test-key');
		const secondBody = (await second.json()) as typeof firstBody;
		expect(secondBody.totalTransactions).toBe(1);
		expect(secondBody.syncedTransactions).toBe(0);
		expect(secondBody.failedTransactions).toBe(1);
	});
});
